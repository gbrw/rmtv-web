package com.rmtv.tv

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.util.TypedValue
import androidx.annotation.StyleRes
import androidx.core.view.WindowInsetsControllerCompat

/**
 * ثيمات التطبيق: خلفية + لون رئيسي، تُحفظ على الجهاز وتُطبَّق قبل عرض كل شاشة.
 */
object ThemeManager {

    data class Option(val key: String, val label: String, @StyleRes val style: Int, val swatch: Int, val light: Boolean = false)

    val BACKGROUNDS = listOf(
        Option("dark", "داكن", R.style.ThemeOverlay_RMTV_Bg_Dark, Color.parseColor("#0F1419")),
        Option("black", "أسود (يوفّر البطارية)", R.style.ThemeOverlay_RMTV_Bg_Black, Color.parseColor("#000000")),
        Option("navy", "كحلي", R.style.ThemeOverlay_RMTV_Bg_Navy, Color.parseColor("#0F172A")),
        Option("light", "فاتح", R.style.ThemeOverlay_RMTV_Bg_Light, Color.parseColor("#F2F4F7"), light = true),
    )

    val ACCENTS = listOf(
        Option("cyan", "سماوي", R.style.ThemeOverlay_RMTV_Accent_Cyan, Color.parseColor("#00D9FF")),
        Option("red", "أحمر", R.style.ThemeOverlay_RMTV_Accent_Red, Color.parseColor("#E53935")),
        Option("green", "أخضر", R.style.ThemeOverlay_RMTV_Accent_Green, Color.parseColor("#22C55E")),
        Option("gold", "ذهبي", R.style.ThemeOverlay_RMTV_Accent_Gold, Color.parseColor("#F5B700")),
        Option("purple", "بنفسجي", R.style.ThemeOverlay_RMTV_Accent_Purple, Color.parseColor("#A855F7")),
        Option("orange", "برتقالي", R.style.ThemeOverlay_RMTV_Accent_Orange, Color.parseColor("#FF7A1A")),
        Option("pink", "وردي", R.style.ThemeOverlay_RMTV_Accent_Pink, Color.parseColor("#EC4899")),
    )

    private const val PREFS = "rmtv_theme"
    private const val KEY_BG = "background"
    private const val KEY_ACCENT = "accent"

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun background(context: Context): Option =
        BACKGROUNDS.firstOrNull { it.key == prefs(context).getString(KEY_BG, null) } ?: BACKGROUNDS[0]

    fun accent(context: Context): Option =
        ACCENTS.firstOrNull { it.key == prefs(context).getString(KEY_ACCENT, null) } ?: ACCENTS[0]

    /**
     * يطبّق الثيم على الشاشة. يُستدعى قبل setContentView.
     * forceDark: المشغل يبقى داكناً دائماً (فقط اللون الرئيسي يتغير).
     */
    fun apply(activity: Activity, forceDark: Boolean = false) {
        val bg = if (forceDark && background(activity).light) BACKGROUNDS[0] else background(activity)
        activity.theme.applyStyle(bg.style, true)
        activity.theme.applyStyle(accent(activity).style, true)
        if (forceDark) return

        val color = resolveColor(activity, R.attr.rmtvBackground)
        activity.window.setBackgroundDrawable(ColorDrawable(color))
        @Suppress("DEPRECATION")
        activity.window.statusBarColor = color
        @Suppress("DEPRECATION")
        activity.window.navigationBarColor = color
        WindowInsetsControllerCompat(activity.window, activity.window.decorView).apply {
            isAppearanceLightStatusBars = bg.light
            isAppearanceLightNavigationBars = bg.light
        }
    }

    fun resolveColor(context: Context, attr: Int): Int {
        val tv = TypedValue()
        context.theme.resolveAttribute(attr, tv, true)
        return tv.data
    }

    /** قائمة الإعدادات: الخلفية، اللون، المشغل الافتراضي */
    fun showSettings(activity: Activity) {
        val items = arrayOf(
            "الخلفية: " + background(activity).label,
            "اللون: " + accent(activity).label,
            activity.getString(R.string.default_player),
        )
        AlertDialog.Builder(activity)
            .setTitle(R.string.settings)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> pick(activity, "الخلفية", BACKGROUNDS, background(activity), KEY_BG)
                    1 -> pick(activity, "اللون", ACCENTS, accent(activity), KEY_ACCENT)
                    2 -> ExternalPlayers.showDefaultPicker(activity)
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun pick(activity: Activity, title: String, options: List<Option>, current: Option, key: String) {
        // دائرة ملونة بجانب كل خيار كمعاينة
        val labels = options.map { o ->
            SpannableString("●  ${o.label}").apply {
                setSpan(ForegroundColorSpan(o.swatch), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                setSpan(RelativeSizeSpan(1.4f), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }.toTypedArray<CharSequence>()

        AlertDialog.Builder(activity)
            .setTitle(title)
            .setSingleChoiceItems(labels, options.indexOf(current)) { dialog, which ->
                prefs(activity).edit().putString(key, options[which].key).apply()
                dialog.dismiss()
                if (options[which] != current) activity.recreate()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }
}
