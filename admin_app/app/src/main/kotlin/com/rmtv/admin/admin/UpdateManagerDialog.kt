package com.rmtv.admin.admin

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.Toast
import com.google.firebase.firestore.FirebaseFirestore
import com.rmtv.admin.R
import java.util.UUID

class UpdateManagerDialog(private val activity: Activity) {

    private val db = FirebaseFirestore.getInstance()
    
    private lateinit var dialog: AlertDialog
    private lateinit var etVersionCode: EditText
    private lateinit var etApkUrl: EditText
    private lateinit var cbForceUpdate: CheckBox
    
    fun show() {
        val view = LayoutInflater.from(activity).inflate(R.layout.dialog_app_update, null)
        etVersionCode = view.findViewById(R.id.etVersionCode)
        etApkUrl = view.findViewById(R.id.etApkUrl)
        cbForceUpdate = view.findViewById(R.id.cbForceUpdate)
        
        loadCurrentSettings()
        
        dialog = AlertDialog.Builder(activity)
            .setView(view)
            .create()

        view.findViewById<Button>(R.id.btnCancel).setOnClickListener { dialog.dismiss() }
        view.findViewById<Button>(R.id.btnSaveUpdate).setOnClickListener { saveSettings() }

        dialog.show()
    }
    
    private fun loadCurrentSettings() {
        db.collection("settings").document("appUpdate").get().addOnSuccessListener { doc ->
            if (doc != null && doc.exists()) {
                val latest = doc.getLong("latestVersionCode")?.toInt() ?: 1
                val url = doc.getString("apkUrl") ?: ""
                val force = doc.getBoolean("forceUpdate") ?: false
                
                etVersionCode.setText(latest.toString())
                etApkUrl.setText(url)
                cbForceUpdate.isChecked = force
            }
        }
    }
    
    private fun saveSettings() {
        val versionText = etVersionCode.text.toString()
        val url = etApkUrl.text.toString()
        
        if (versionText.isEmpty() || url.isEmpty()) {
            Toast.makeText(activity, "جميع الحقول مطلوبة!", Toast.LENGTH_SHORT).show()
            return
        }
        
        val data = mapOf(
            "latestVersionCode" to versionText.toInt(),
            "apkUrl" to url,
            "forceUpdate" to cbForceUpdate.isChecked
        )
        
        db.collection("settings").document("appUpdate").set(data).addOnSuccessListener {
            Toast.makeText(activity, "تم نشر التحديث بنجاح للمستخدمين!", Toast.LENGTH_LONG).show()
            dialog.dismiss()
        }.addOnFailureListener {
            Toast.makeText(activity, "فشل نشر التحديث", Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        const val APK_PICK_REQUEST = 3214
    }
}
