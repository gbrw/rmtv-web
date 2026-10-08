package com.rmtv.tv

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.widget.Toast
import com.rmtv.tv.models.Channel

/**
 * فتح القنوات في مشغلات خارجية (VLC، MX Player، ...) وحفظ المشغل الافتراضي.
 */
object ExternalPlayers {

    data class App(val pkg: String, val label: String)

    /** المشغلات المعروفة، تظهر فقط المثبتة منها على الجهاز */
    private val KNOWN = listOf(
        App("org.videolan.vlc", "VLC"),
        App("com.mxtech.videoplayer.ad", "MX Player"),
        App("com.mxtech.videoplayer.pro", "MX Player Pro"),
        App("com.brouken.player", "Just Player"),
        App("com.kmplayer", "KMPlayer"),
        App("video.player.videoplayer", "XPlayer"),
        App("com.instantbits.cast.webvideo", "Web Video Cast"),
        App("org.xbmc.kodi", "Kodi"),
    )

    const val INTERNAL = "internal"
    const val ASK = "ask"
    private const val OTHER = "other"
    private const val PREFS = "rmtv_player"
    private const val KEY_DEFAULT = "default_player"

    private const val USER_AGENT = "IPTVSmartersPro"

    fun installed(context: Context): List<App> =
        KNOWN.filter { isInstalled(context, it.pkg) }

    private fun isInstalled(context: Context, pkg: String): Boolean = try {
        if (Build.VERSION.SDK_INT >= 33) {
            context.packageManager.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(pkg, 0)
        }
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    fun getDefault(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_DEFAULT, INTERNAL) ?: INTERNAL

    fun setDefault(context: Context, value: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_DEFAULT, value).apply()
    }

    /**
     * يفتح القناة بمشغل محدد. pkg = null يعرض قائمة كل المشغلات المثبتة في النظام.
     * يعيد false إذا لم ينجح (المشغل غير مثبت).
     */
    fun open(activity: Activity, channel: Channel, pkg: String?): Boolean {
        val uri = Uri.parse(channel.url.trim())
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mimeFor(channel.url))
            putExtra("title", channel.name)            // VLC + MX
            putExtra("itemTitle", channel.name)        // VLC
            putExtra("decode_mode", 1)                 // MX: فك ترميز بالعتاد
            putExtra("headers", arrayOf("User-Agent", USER_AGENT)) // MX
            putExtra("secure_uri", true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            if (pkg != null) {
                intent.setPackage(pkg)
                activity.startActivity(intent)
            } else {
                activity.startActivity(Intent.createChooser(intent, activity.getString(R.string.choose_player)))
            }
            true
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(activity, R.string.player_not_installed, Toast.LENGTH_LONG).show()
            false
        }
    }

    private fun mimeFor(url: String): String {
        val path = url.substringBefore('?').lowercase().trimEnd('/')
        return when {
            path.endsWith(".mp4") -> "video/mp4"
            path.endsWith(".ts") -> "video/mp2t"
            path.endsWith(".mkv") -> "video/x-matroska"
            else -> "application/x-mpegURL" // m3u8 وروابط IPTV بدون امتداد
        }
    }

    /** قائمة اختيار مشغل خارجي لقناة معيّنة */
    fun showChooser(activity: Activity, channel: Channel, onInternal: (() -> Unit)? = null) {
        val apps = installed(activity)
        val labels = mutableListOf<String>()
        val actions = mutableListOf<() -> Unit>()

        if (onInternal != null) {
            labels += activity.getString(R.string.internal_player)
            actions += onInternal
        }
        apps.forEach { app ->
            labels += app.label
            actions += { open(activity, channel, app.pkg) }
        }
        labels += activity.getString(R.string.other_player)
        actions += { open(activity, channel, null) }

        AlertDialog.Builder(activity)
            .setTitle(activity.getString(R.string.open_with, channel.name))
            .setItems(labels.toTypedArray()) { _, which -> actions[which]() }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /** إعداد المشغل الافتراضي الذي تُفتح به القنوات */
    fun showDefaultPicker(activity: Activity) {
        val apps = installed(activity)
        val values = mutableListOf(INTERNAL, ASK)
        val labels = mutableListOf(activity.getString(R.string.internal_player), activity.getString(R.string.ask_every_time))
        apps.forEach { values += it.pkg; labels += it.label }
        values += OTHER
        labels += activity.getString(R.string.other_player)

        val current = values.indexOf(getDefault(activity)).coerceAtLeast(0)
        AlertDialog.Builder(activity)
            .setTitle(R.string.default_player)
            .setSingleChoiceItems(labels.toTypedArray(), current) { dialog, which ->
                setDefault(activity, values[which])
                dialog.dismiss()
                Toast.makeText(activity, activity.getString(R.string.default_player_set, labels[which]), Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /**
     * يقرر كيف تُفتح القناة حسب الإعداد الافتراضي.
     * يعيد true إذا فُتحت خارجياً، false إذا يجب فتح المشغل الداخلي.
     */
    fun openWithDefault(activity: Activity, channel: Channel, openInternal: () -> Unit): Boolean {
        return when (val def = getDefault(activity)) {
            INTERNAL -> false
            ASK -> { showChooser(activity, channel, onInternal = openInternal); true }
            OTHER -> open(activity, channel, null)
            else -> if (isInstalled(activity, def)) open(activity, channel, def) else false
        }
    }
}
