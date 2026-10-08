package com.rmtv.tv

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.rmtv.tv.adapters.ChannelsAdapter
import com.rmtv.tv.adapters.NetworksAdapter
import com.rmtv.tv.databinding.ActivityMainBinding
import com.rmtv.tv.models.Channel
import com.rmtv.tv.models.Network

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val db by lazy { FirebaseFirestore.getInstance() }

    private lateinit var networksAdapter: NetworksAdapter
    private lateinit var channelsAdapter: ChannelsAdapter

    private var networksListener: ListenerRegistration? = null
    private var channelsListener: ListenerRegistration? = null

    private enum class ViewMode { NETWORKS, CHANNELS }
    private var currentMode = ViewMode.NETWORKS

    // الباقة المفتوحة حالياً، وموقعها للعودة إليه عند الرجوع
    private var currentNetwork: Network? = null
    private var lastNetworkPosition = 0
    private var firstLoad = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ThemeManager.apply(this)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupAdapters()
        setupSearch()
        // الإعدادات: الثيم (الخلفية واللون) والمشغل الافتراضي
        binding.btnSettings.setOnClickListener { ThemeManager.showSettings(this) }
        binding.rvNetworks.setHasFixedSize(true)
        binding.rvNetworks.itemAnimator = null // تحديث القائمة بدون وميض
        showNetworksView()
        loadNetworks()

        // التحقق من وجود تحديث
        UpdateHelper.checkForUpdates(this)
    }

    private fun setupAdapters() {
        networksAdapter = NetworksAdapter { network -> handleNetworkClick(network) }
        channelsAdapter = ChannelsAdapter(
            compact = false,
            onChannelClick = { channel -> openPlayer(channel) },
            // ضغطة طويلة: اختيار مشغل خارجي لهذه القناة
            onChannelLongClick = { channel ->
                ExternalPlayers.showChooser(this, channel, onInternal = { openInternalPlayer(channel) })
            }
        )
    }

    /**
     * البحث لا يأخذ التركيز ولا يفتح الكيبورد تلقائياً عند فتح التطبيق.
     * الكيبورد يظهر فقط عند الضغط على مربع البحث.
     */
    private fun setupSearch() {
        binding.etSearch.showSoftInputOnFocus = false
        binding.etSearch.setOnClickListener { showKeyboard() }
        binding.etSearch.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH || actionId == EditorInfo.IME_ACTION_DONE) {
                hideKeyboard()
                focusFirstItem()
                true
            } else false
        }
        binding.etSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val query = s.toString()
                if (currentMode == ViewMode.NETWORKS) networksAdapter.filter(query)
                else channelsAdapter.filter(query)
            }
            override fun afterTextChanged(s: Editable?) {}
        })
    }

    private fun showKeyboard() {
        binding.etSearch.requestFocus()
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.showSoftInput(binding.etSearch, InputMethodManager.SHOW_IMPLICIT)
    }

    private fun hideKeyboard() {
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(binding.etSearch.windowToken, 0)
        binding.etSearch.clearFocus()
    }

    /** نقل التركيز لأول عنصر في القائمة (للريموت) بدل مربع البحث */
    private fun focusFirstItem(position: Int = 0) {
        binding.rvNetworks.post {
            val lm = binding.rvNetworks.layoutManager ?: return@post
            lm.scrollToPosition(position)
            binding.rvNetworks.post {
                binding.rvNetworks.findViewHolderForAdapterPosition(position)?.itemView?.requestFocus()
                    ?: binding.rvNetworks.requestFocus()
            }
        }
    }

    private fun isNetworkAvailable(): Boolean {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val network = connectivityManager.activeNetwork ?: return false
            val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } else {
            @Suppress("DEPRECATION")
            val networkInfo = connectivityManager.activeNetworkInfo
            networkInfo != null && networkInfo.isConnected
        }
    }

    private fun loadNetworks() {
        if (!isNetworkAvailable()) {
            showError("لا يوجد اتصال بالإنترنت\nالرجاء التحقق من الشبكة")
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        networksListener = db.collection("networks")
            .whereEqualTo("isActive", true)
            .addSnapshotListener { snapshot, error ->
                binding.progressBar.visibility = View.GONE
                if (error != null) {
                    showError("خطأ في جلب البيانات: " + error.message)
                    return@addSnapshotListener
                }

                val networks = snapshot?.documents?.mapNotNull { doc ->
                    Network(
                        id = doc.id,
                        name = doc.getString("name") ?: "",
                        logoUrl = doc.getString("logoUrl") ?: "",
                        order = (doc.getLong("order") ?: 0).toInt()
                    )
                }?.sortedBy { it.order } ?: emptyList()

                if (networks.isEmpty()) {
                    showError("لا توجد باقات متاحة حالياً")
                } else {
                    binding.tvError.visibility = View.GONE
                    networksAdapter.submitNetworks(networks)
                    if (firstLoad && currentMode == ViewMode.NETWORKS) {
                        firstLoad = false
                        focusFirstItem()
                    }
                }
            }
    }

    private fun handleNetworkClick(network: Network) {
        // نتذكر الباقة التي فُتحت حتى يعود التركيز إليها عند الرجوع
        lastNetworkPosition = binding.rvNetworks.findContainingViewHolder(
            binding.rvNetworks.focusedChild ?: binding.rvNetworks
        )?.bindingAdapterPosition?.takeIf { it >= 0 }
            ?: (binding.rvNetworks.layoutManager as? LinearLayoutManager)?.findFirstVisibleItemPosition()?.coerceAtLeast(0)
            ?: 0
        currentMode = ViewMode.CHANNELS
        currentNetwork = network
        binding.tvPackagesTitle.text = network.name
        binding.tvPackagesSubtitle.text = "اختر القناة للمشاهدة · ضغطة طويلة لمشغل خارجي"
        binding.etSearch.hint = getString(R.string.search_channels)
        binding.etSearch.text?.clear()
        hideKeyboard()

        channelsAdapter.submitChannels(emptyList())
        binding.rvNetworks.layoutManager = LinearLayoutManager(this)
        binding.rvNetworks.adapter = channelsAdapter
        loadChannelsForNetwork(network.id)
    }

    private fun loadChannelsForNetwork(networkId: String) {
        binding.progressBar.visibility = View.VISIBLE
        channelsListener?.remove()
        var focused = false

        channelsListener = db.collection("channels")
            .whereEqualTo("networkId", networkId)
            .whereEqualTo("isActive", true)
            .addSnapshotListener { snapshot, error ->
                binding.progressBar.visibility = View.GONE
                if (error != null) {
                    android.util.Log.e("RMTV", "Channels error: " + error.message)
                    return@addSnapshotListener
                }

                val channels = snapshot?.documents?.mapNotNull { doc ->
                    Channel(
                        id = doc.id,
                        name = doc.getString("name") ?: "",
                        logoUrl = doc.getString("logoUrl") ?: "",
                        url = doc.getString("url") ?: "",
                        streamType = doc.getString("streamType") ?: "direct",
                        networkId = doc.getString("networkId") ?: "",
                        order = (doc.getLong("order") ?: 0).toInt()
                    )
                }?.sortedBy { it.order } ?: emptyList()

                channelsAdapter.submitChannels(channels)
                if (channels.isEmpty()) showError("لا توجد قنوات في هذه الباقة")
                else binding.tvError.visibility = View.GONE
                if (!focused && channels.isNotEmpty()) {
                    focused = true
                    focusFirstItem()
                }
            }
    }

    private fun showNetworksView() {
        val returning = currentMode == ViewMode.CHANNELS
        currentMode = ViewMode.NETWORKS
        currentNetwork = null
        channelsListener?.remove()
        channelsListener = null
        binding.tvPackagesTitle.text = "اختر باقتك"
        binding.tvPackagesSubtitle.text = "استمتع بأفضل التغطيات الرياضية العالمية والمحلية"
        binding.etSearch.hint = getString(R.string.search_networks)
        binding.etSearch.text?.clear()
        binding.tvError.visibility = View.GONE

        binding.rvNetworks.layoutManager = LinearLayoutManager(this)
        binding.rvNetworks.adapter = networksAdapter
        networksAdapter.filter("")
        if (returning) focusFirstItem(lastNetworkPosition)
    }

    private fun showError(msg: String) {
        binding.progressBar.visibility = View.GONE
        binding.tvError.visibility = View.VISIBLE
        binding.tvError.text = msg
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when {
            binding.etSearch.hasFocus() && binding.etSearch.text?.isNotEmpty() == true -> {
                binding.etSearch.text?.clear()
                hideKeyboard()
                focusFirstItem()
            }
            currentMode == ViewMode.CHANNELS -> showNetworksView()
            else -> @Suppress("DEPRECATION") super.onBackPressed()
        }
    }

    /** يفتح القناة حسب المشغل الافتراضي المختار (داخلي أو خارجي) */
    private fun openPlayer(channel: Channel) {
        val openedExternally = ExternalPlayers.openWithDefault(this, channel) { openInternalPlayer(channel) }
        if (!openedExternally) openInternalPlayer(channel)
    }

    private fun openInternalPlayer(channel: Channel) {
        val channelsList = channelsAdapter.currentList.toList()
        PlayerActivity.currentChannelList = channelsList
        val index = channelsList.indexOfFirst { it.id == channel.id }

        val intent = Intent(this, PlayerActivity::class.java).apply {
            putExtra("url", channel.url)
            putExtra("streamType", channel.streamType)
            putExtra("channelName", channel.name)
            putExtra("networkId", channel.networkId)
            putExtra("networkName", currentNetwork?.name ?: "")
            putExtra("channelIndex", if (index >= 0) index else 0)
        }
        startActivity(intent)
    }

    override fun onDestroy() {
        super.onDestroy()
        networksListener?.remove()
        channelsListener?.remove()
    }
}
