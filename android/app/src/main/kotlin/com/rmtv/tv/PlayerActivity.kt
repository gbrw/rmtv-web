package com.rmtv.tv

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.recyclerview.widget.LinearLayoutManager
import com.bumptech.glide.Glide
import com.rmtv.tv.adapters.ChannelsAdapter
import com.rmtv.tv.databinding.ActivityPlayerBinding
import com.rmtv.tv.models.Channel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * مشغل القنوات المباشرة.
 *
 * الاستقرار:
 *  - إعادة اتصال تلقائية بلا حدود عند أي خطأ، بتأخير متزايد (1، 2، 3، 5، 8 ثم 10 ثوانٍ).
 *  - مراقب (watchdog) يكتشف تجمّد الصورة (الوقت لا يتقدم) أو التحميل الطويل ويعيد التحميل.
 *  - عند رجوع الإنترنت يعاد الاتصال فوراً.
 *  - تبقى آخر صورة ظاهرة أثناء إعادة الاتصال بدل شاشة سوداء.
 *
 * التحكم بالريموت (التلفاز):
 *  - أعلى/أسفل: القناة التالية/السابقة (عندما تكون أزرار التحكم مخفية)
 *  - يمين/يسار: قائمة القنوات   - OK: إظهار الأزرار   - رجوع: إغلاق القائمة/الأزرار ثم الخروج
 */
@UnstableApi
class PlayerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPlayerBinding
    private var player: ExoPlayer? = null

    private var channels: List<Channel> = emptyList()
    private var channelIndex = 0
    private var networkName = ""
    private val current: Channel? get() = channels.getOrNull(channelIndex)

    private val handler = Handler(Looper.getMainLooper())
    private var reconnectAttempts = 0
    private var resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT

    // المراقب
    private var lastPosition = -1L
    private var stalledSince = 0L
    private var bufferingSince = 0L
    private var hasPlayed = false

    private lateinit var panelAdapter: ChannelsAdapter
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    companion object {
        /** قائمة قنوات الباقة الحالية (تُمرَّر من MainActivity) */
        var currentChannelList: List<Channel>? = null

        private const val USER_AGENT = "IPTVSmartersPro" // مقبول من أغلب سيرفرات IPTV
        private const val WATCHDOG_INTERVAL = 2_000L
        private const val FROZEN_TIMEOUT = 8_000L       // الصورة متوقفة أثناء "التشغيل"
        private const val BUFFERING_TIMEOUT = 15_000L   // تحميل مستمر بلا تقدم
        private const val SHOW_ACTIONS_AFTER = 6        // بعد كم محاولة تظهر أزرار المساعدة
        private val RETRY_DELAYS = longArrayOf(1_000, 2_000, 3_000, 5_000, 8_000, 10_000)

        private val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ThemeManager.apply(this, forceDark = true)
        binding = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(binding.root)
        hideSystemUI()

        channels = currentChannelList ?: emptyList()
        channelIndex = intent.getIntExtra("channelIndex", 0).coerceIn(0, (channels.size - 1).coerceAtLeast(0))
        networkName = intent.getStringExtra("networkName") ?: ""

        // تشغيل قناة واحدة إذا فُتح المشغل بدون قائمة
        if (channels.isEmpty()) {
            val url = intent.getStringExtra("url").orEmpty()
            if (url.isEmpty()) { finish(); return }
            channels = listOf(Channel(
                id = url, name = intent.getStringExtra("channelName").orEmpty(), url = url,
                streamType = intent.getStringExtra("streamType") ?: "direct",
                networkId = intent.getStringExtra("networkId").orEmpty()
            ))
            channelIndex = 0
        }

        setupPlayer()
        setupControls()
        setupChannelPanel()
        playCurrent(showBanner = true)
    }

    // ---------------- إعداد ExoPlayer ----------------

    private fun setupPlayer() {
        val httpFactory = DefaultHttpDataSource.Factory()
            .setUserAgent(USER_AGENT)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)
            .setKeepPostFor302Redirects(true)

        val mediaSourceFactory = DefaultMediaSourceFactory(this)
            .setDataSourceFactory(httpFactory)
            // إعادة محاولة تحميل المقاطع عدة مرات قبل اعتبارها خطأ
            .setLoadErrorHandlingPolicy(DefaultLoadErrorHandlingPolicy(6))

        // ذاكرة مؤقتة مناسبة للبث المباشر: تشغيل سريع مع مخزون يمتص تذبذب الإنترنت
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs = */ 15_000,
                /* maxBufferMs = */ 50_000,
                /* bufferForPlaybackMs = */ 1_500,
                /* bufferForPlaybackAfterRebufferMs = */ 4_000
            )
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()

        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(mediaSourceFactory)
            .setLoadControl(loadControl)
            .build()
            .also { exo ->
                exo.playWhenReady = true
                exo.setVideoScalingMode(C.VIDEO_SCALING_MODE_SCALE_TO_FIT)
                binding.playerView.player = exo
                binding.playerView.resizeMode = resizeMode
                exo.addListener(playerListener)
            }

        binding.playerView.setControllerVisibilityListener(
            androidx.media3.ui.PlayerView.ControllerVisibilityListener { visibility ->
                if (visibility == View.VISIBLE) findViewById<View>(R.id.btnPlayPause)?.requestFocus()
            }
        )
    }

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) {
            when (state) {
                Player.STATE_BUFFERING -> {
                    showLoading(true)
                    if (bufferingSince == 0L) bufferingSince = System.currentTimeMillis()
                }
                Player.STATE_READY -> {
                    showLoading(false)
                    bufferingSince = 0L
                    hasPlayed = true
                    reconnectAttempts = 0
                    hideStatus()
                }
                // البث المباشر لا ينتهي؛ إذا انتهى فالسيرفر قطع الاتصال
                Player.STATE_ENDED -> reconnect(immediate = true)
                Player.STATE_IDLE -> Unit
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            findViewById<ImageButton>(R.id.btnPlayPause)?.setImageResource(
                if (isPlaying) R.drawable.ic_pause else R.drawable.ic_play
            )
        }

        override fun onPlayerError(error: PlaybackException) {
            if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                // تأخرنا عن البث المباشر: نقفز لآخر نقطة بدون إظهار خطأ
                player?.seekToDefaultPosition()
                player?.prepare()
                return
            }
            reconnect()
        }
    }

    // ---------------- التشغيل ----------------

    private fun playCurrent(showBanner: Boolean = false) {
        val ch = current ?: return
        handler.removeCallbacks(reconnectRunnable)
        reconnectAttempts = 0
        hasPlayed = false
        bufferingSince = 0L
        stalledSince = 0L
        lastPosition = -1L
        hideStatus()
        updateOverlay(ch)
        if (showBanner) showZapBanner(ch)
        panelAdapter.playingId = ch.id
        startMedia(ch)
    }

    private fun startMedia(ch: Channel) {
        showLoading(true)
        val isYouTube = ch.streamType.contains("youtube", ignoreCase = true) ||
            ch.url.contains("youtube.com") || ch.url.contains("youtu.be")

        if (!isYouTube) {
            setMedia(ch.url)
            return
        }
        lifecycleScope.launch {
            val resolved = withContext(Dispatchers.IO) { extractYouTubeUrl(ch.url) }
            if (current?.id == ch.id) setMedia(resolved)
        }
    }

    private fun setMedia(url: String) {
        val exo = player ?: return
        val lower = url.substringBefore('?').lowercase().trimEnd('/')
        val item = MediaItem.Builder()
            .setUri(Uri.parse(url.trim()))
            .setLiveConfiguration(
                // يسمح بتسريع بسيط للحاق بالبث المباشر بعد التقطيع
                MediaItem.LiveConfiguration.Builder()
                    .setMinPlaybackSpeed(0.97f)
                    .setMaxPlaybackSpeed(1.04f)
                    .build()
            )
            .apply {
                when {
                    lower.endsWith(".m3u8") || lower.endsWith(".m3u") -> setMimeType(MimeTypes.APPLICATION_M3U8)
                    lower.endsWith(".mpd") -> setMimeType(MimeTypes.APPLICATION_MPD)
                }
            }
            .build()
        exo.setMediaItem(item)
        exo.prepare()
        exo.playWhenReady = true
        startWatchdog()
    }

    /** إعادة اتصال بتأخير متزايد، بدون حد أقصى (البث المباشر يجب أن يعود وحده) */
    private fun reconnect(immediate: Boolean = false) {
        handler.removeCallbacks(reconnectRunnable)
        reconnectAttempts++
        val delay = if (immediate) 300L
        else RETRY_DELAYS[(reconnectAttempts - 1).coerceAtMost(RETRY_DELAYS.size - 1)]

        showLoading(true)
        if (reconnectAttempts >= 2 || !hasPlayed) {
            showStatus(
                if (reconnectAttempts >= SHOW_ACTIONS_AFTER) getString(R.string.stream_failed) + "\n" +
                    getString(R.string.reconnecting, reconnectAttempts)
                else getString(R.string.reconnecting, reconnectAttempts),
                withActions = reconnectAttempts >= SHOW_ACTIONS_AFTER
            )
        }
        handler.postDelayed(reconnectRunnable, delay)
    }

    private val reconnectRunnable = Runnable {
        val ch = current ?: return@Runnable
        bufferingSince = 0L
        stalledSince = 0L
        lastPosition = -1L
        player?.stop()
        startMedia(ch)
    }

    // ---------------- المراقب: كشف تجمّد الصورة ----------------

    private fun startWatchdog() {
        handler.removeCallbacks(watchdog)
        handler.postDelayed(watchdog, WATCHDOG_INTERVAL)
    }

    private val watchdog = object : Runnable {
        override fun run() {
            val exo = player ?: return
            val now = System.currentTimeMillis()

            if (exo.playWhenReady && exo.playbackState == Player.STATE_READY) {
                val pos = exo.currentPosition
                if (pos == lastPosition) {
                    if (stalledSince == 0L) stalledSince = now
                    else if (now - stalledSince > FROZEN_TIMEOUT) {
                        Toast.makeText(this@PlayerActivity, R.string.stream_frozen, Toast.LENGTH_SHORT).show()
                        stalledSince = 0L
                        reconnect(immediate = true)
                    }
                } else {
                    stalledSince = 0L
                }
                lastPosition = pos
            } else {
                stalledSince = 0L
            }

            if (exo.playWhenReady && exo.playbackState == Player.STATE_BUFFERING &&
                bufferingSince != 0L && now - bufferingSince > BUFFERING_TIMEOUT
            ) {
                bufferingSince = 0L
                reconnect(immediate = true)
            }

            handler.postDelayed(this, WATCHDOG_INTERVAL)
        }
    }

    // ---------------- رجوع الإنترنت ----------------

    private fun registerNetworkCallback() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                handler.post {
                    // إذا كنا ننتظر إعادة الاتصال، نعيد المحاولة فوراً
                    if (reconnectAttempts > 0 || player?.playerError != null) {
                        reconnectAttempts = 0
                        handler.removeCallbacks(reconnectRunnable)
                        handler.post(reconnectRunnable)
                    }
                }
            }

            override fun onLost(network: Network) {
                handler.post { showStatus(getString(R.string.network_lost), withActions = false) }
            }
        }
        try {
            cm.registerDefaultNetworkCallback(cb)
            networkCallback = cb
        } catch (_: Exception) {
        }
    }

    private fun unregisterNetworkCallback() {
        val cb = networkCallback ?: return
        try {
            (getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(cb)
        } catch (_: Exception) {
        }
        networkCallback = null
    }

    // ---------------- الواجهة ----------------

    private fun setupControls() {
        findViewById<ImageButton>(R.id.btnBack)?.setOnClickListener { finish() }
        findViewById<ImageButton>(R.id.btnPrevChannel)?.setOnClickListener { switchChannel(-1) }
        findViewById<ImageButton>(R.id.btnNextChannel)?.setOnClickListener { switchChannel(1) }
        findViewById<ImageButton>(R.id.btnPlayPause)?.setOnClickListener {
            val exo = player ?: return@setOnClickListener
            if (exo.isPlaying) exo.pause()
            else {
                // بعد الإيقاف المؤقت نعود لآخر نقطة في البث المباشر
                if (exo.isCurrentMediaItemLive) exo.seekToDefaultPosition()
                exo.play()
            }
        }
        findViewById<ImageButton>(R.id.btnReload)?.setOnClickListener {
            reconnectAttempts = 0
            handler.removeCallbacks(reconnectRunnable)
            handler.post(reconnectRunnable)
        }
        findViewById<ImageButton>(R.id.btnAspect)?.setOnClickListener { cycleResizeMode() }
        findViewById<ImageButton>(R.id.btnExternal)?.setOnClickListener { openExternal() }
        findViewById<ImageButton>(R.id.btnChannels)?.setOnClickListener { togglePanel(true) }

        binding.btnStatusRetry.setOnClickListener {
            reconnectAttempts = 0
            handler.removeCallbacks(reconnectRunnable)
            handler.post(reconnectRunnable)
        }
        binding.btnStatusExternal.setOnClickListener { openExternal() }
        binding.btnStatusNext.setOnClickListener { switchChannel(1) }
    }

    private fun setupChannelPanel() {
        panelAdapter = ChannelsAdapter(
            compact = true,
            onChannelClick = { ch ->
                val index = channels.indexOfFirst { it.id == ch.id }
                if (index >= 0 && index != channelIndex) {
                    channelIndex = index
                    playCurrent(showBanner = true)
                }
                togglePanel(false)
            },
            onChannelLongClick = { ch -> ExternalPlayers.showChooser(this, ch) }
        )
        binding.rvPanelChannels.layoutManager = LinearLayoutManager(this)
        binding.rvPanelChannels.adapter = panelAdapter
        binding.rvPanelChannels.setHasFixedSize(true)
        panelAdapter.submitChannels(channels)
        binding.tvPanelTitle.text = if (networkName.isNotEmpty()) networkName else getString(R.string.channels)
    }

    private fun togglePanel(show: Boolean) {
        if (show) {
            binding.playerView.hideController()
            binding.channelPanel.visibility = View.VISIBLE
            binding.channelPanel.alpha = 0f
            binding.channelPanel.animate().alpha(1f).setDuration(150).start()
            (binding.rvPanelChannels.layoutManager as LinearLayoutManager)
                .scrollToPositionWithOffset(channelIndex, 120)
            binding.rvPanelChannels.post {
                binding.rvPanelChannels.findViewHolderForAdapterPosition(channelIndex)?.itemView?.requestFocus()
                    ?: binding.rvPanelChannels.requestFocus()
            }
        } else {
            binding.channelPanel.visibility = View.GONE
        }
    }

    private val isPanelOpen get() = binding.channelPanel.visibility == View.VISIBLE

    private fun switchChannel(delta: Int) {
        if (channels.size < 2) return
        channelIndex = (channelIndex + delta + channels.size) % channels.size
        playCurrent(showBanner = true)
    }

    private fun openExternal() {
        val ch = current ?: return
        player?.pause()
        ExternalPlayers.showChooser(this, ch)
    }

    private fun cycleResizeMode() {
        resizeMode = when (resizeMode) {
            AspectRatioFrameLayout.RESIZE_MODE_FIT -> AspectRatioFrameLayout.RESIZE_MODE_FILL
            AspectRatioFrameLayout.RESIZE_MODE_FILL -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
        }
        binding.playerView.resizeMode = resizeMode
        val label = getString(
            when (resizeMode) {
                AspectRatioFrameLayout.RESIZE_MODE_FILL -> R.string.resize_fill
                AspectRatioFrameLayout.RESIZE_MODE_ZOOM -> R.string.resize_zoom
                else -> R.string.resize_fit
            }
        )
        findViewById<TextView>(R.id.tvAspect)?.text = label
        Toast.makeText(this, label, Toast.LENGTH_SHORT).show()
    }

    private fun updateOverlay(ch: Channel) {
        findViewById<TextView>(R.id.tvOverlayChannelName)?.text = "${channelIndex + 1}. ${ch.name}"
        findViewById<TextView>(R.id.tvOverlayNetwork)?.text = networkName
        findViewById<ImageView>(R.id.ivOverlayLogo)?.let { iv ->
            Glide.with(this).load(ch.logoUrl.ifBlank { null }).error(R.drawable.ic_tv).fitCenter().into(iv)
        }
    }

    private fun showZapBanner(ch: Channel) {
        binding.tvZapNumber.text = (channelIndex + 1).toString()
        binding.tvZapName.text = ch.name
        Glide.with(this).load(ch.logoUrl.ifBlank { null }).error(R.drawable.ic_tv).fitCenter().into(binding.ivZapLogo)
        binding.zapBanner.visibility = View.VISIBLE
        binding.zapBanner.alpha = 1f
        handler.removeCallbacks(hideZap)
        handler.postDelayed(hideZap, 3_000)
    }

    private val hideZap = Runnable {
        binding.zapBanner.animate().alpha(0f).setDuration(250).withEndAction {
            binding.zapBanner.visibility = View.GONE
        }.start()
    }

    private fun showLoading(show: Boolean) {
        binding.progressBar.visibility = if (show) View.VISIBLE else View.GONE
    }

    private fun showStatus(text: String, withActions: Boolean) {
        binding.tvStatus.text = text
        binding.statusActions.visibility = if (withActions) View.VISIBLE else View.GONE
        binding.statusPanel.visibility = View.VISIBLE
        if (withActions && !isPanelOpen) binding.btnStatusRetry.requestFocus()
    }

    private fun hideStatus() {
        binding.statusPanel.visibility = View.GONE
    }

    private fun hideSystemUI() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    // ---------------- الريموت ----------------

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        val controlsVisible = binding.playerView.isControllerFullyVisible
        val statusActionsVisible = binding.statusPanel.visibility == View.VISIBLE &&
            binding.statusActions.visibility == View.VISIBLE

        when (keyCode) {
            KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_MEDIA_NEXT -> { switchChannel(1); return true }
            KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_MEDIA_PREVIOUS -> { switchChannel(-1); return true }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> { findViewById<View>(R.id.btnPlayPause)?.performClick(); return true }
            KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_GUIDE -> { togglePanel(!isPanelOpen); return true }
        }

        // عندما تكون الأزرار أو القائمة ظاهرة يتنقل الريموت بينها بشكل طبيعي
        if (isPanelOpen || controlsVisible || statusActionsVisible) return super.onKeyDown(keyCode, event)

        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP -> { switchChannel(1); return true }
            KeyEvent.KEYCODE_DPAD_DOWN -> { switchChannel(-1); return true }
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> { togglePanel(true); return true }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> { binding.playerView.showController(); return true }
        }
        return super.onKeyDown(keyCode, event)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when {
            isPanelOpen -> togglePanel(false)
            binding.playerView.isControllerFullyVisible -> binding.playerView.hideController()
            else -> @Suppress("DEPRECATION") super.onBackPressed()
        }
    }

    // ---------------- دورة الحياة ----------------

    override fun onStart() {
        super.onStart()
        registerNetworkCallback()
        // عند الرجوع للتطبيق نعود لآخر نقطة في البث المباشر
        player?.let {
            if (it.playbackState == Player.STATE_IDLE || it.isCurrentMediaItemLive) {
                handler.post(reconnectRunnable)
            }
        }
        startWatchdog()
    }

    override fun onStop() {
        super.onStop()
        unregisterNetworkCallback()
        handler.removeCallbacks(watchdog)
        handler.removeCallbacks(reconnectRunnable)
        player?.stop()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)
        player?.removeListener(playerListener)
        player?.release()
        player = null
    }

    // ---------------- يوتيوب ----------------

    private fun extractYouTubeUrl(url: String): String {
        return try {
            if (!url.contains("youtube.com") && !url.contains("youtu.be")) return url
            val videoId = when {
                url.contains("v=") -> url.split("v=")[1].substringBefore("&")
                url.contains("youtu.be/") -> url.split("youtu.be/")[1].substringBefore("?")
                else -> return url
            }
            val body = "{\"url\":\"https://www.youtube.com/watch?v=$videoId\",\"vCodec\":\"h264\",\"vQuality\":\"720\",\"isAudioOnly\":false,\"isNoAudio\":false}"
                .toRequestBody("application/json".toMediaTypeOrNull())
            val request = Request.Builder()
                .url("https://co.wuk.sh/api/json")
                .post(body)
                .header("Accept", "application/json")
                .build()
            okHttpClient.newCall(request).execute().use { response ->
                val json = response.body?.string() ?: return url
                val obj = JSONObject(json)
                if (obj.has("url")) obj.getString("url") else url
            }
        } catch (e: Exception) {
            url
        }
    }
}
