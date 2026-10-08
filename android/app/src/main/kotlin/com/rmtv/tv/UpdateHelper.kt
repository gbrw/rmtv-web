package com.rmtv.tv

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

object UpdateHelper {

    fun checkForUpdates(activity: Activity) {
        try {
            val packageInfo = activity.packageManager.getPackageInfo(activity.packageName, 0)
            val currentVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.longVersionCode.toInt()
            } else {
                packageInfo.versionCode
            }
            
            val db = FirebaseFirestore.getInstance()
        
            db.collection("settings").document("appUpdate")
                .get()
                .addOnSuccessListener { document ->
                    if (document != null && document.exists()) {
                        val latestVersionCode = document.getLong("latestVersionCode")?.toInt() ?: currentVersionCode
                        val apkUrl = document.getString("apkUrl") ?: ""
                        val forceUpdate = document.getBoolean("forceUpdate") ?: false
                        
                        if (latestVersionCode > currentVersionCode && apkUrl.isNotEmpty()) {
                            showUpdateDialog(activity, apkUrl, forceUpdate)
                        }
                    }
                }
                .addOnFailureListener { e ->
                    Log.e("RMTV", "Error checking for updates", e)
                }
        } catch (e: Exception) {
             Log.e("RMTV", "Error getting version code", e)
        }
    }

    private fun showUpdateDialog(activity: Activity, apkUrl: String, forceUpdate: Boolean) {
        val dialogView = LayoutInflater.from(activity).inflate(R.layout.dialog_update, null)
        val btnUpdate = dialogView.findViewById<Button>(R.id.btnUpdate)
        val pbUpdate = dialogView.findViewById<ProgressBar>(R.id.pbUpdate)
        
        val dialog = AlertDialog.Builder(activity)
            .setView(dialogView)
            .setCancelable(!forceUpdate)
            .create()

        btnUpdate.setOnClickListener {
            btnUpdate.visibility = View.GONE
            pbUpdate.visibility = View.VISIBLE
            downloadAndInstallUpdate(activity, apkUrl, pbUpdate)
        }

        dialog.show()
    }

    private fun downloadAndInstallUpdate(activity: Activity, apkUrl: String, pbUpdate: ProgressBar) {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                var finalUrlStr = apkUrl
                
                // If it's a mediafire link, we need to extract the actual download link
                if (apkUrl.contains("mediafire.com/file")) {
                    val pageCon = URL(apkUrl).openConnection() as HttpURLConnection
                    pageCon.requestMethod = "GET"
                    pageCon.setRequestProperty("User-Agent", "Mozilla/5.0")
                    pageCon.connect()
                    
                    if (pageCon.responseCode == HttpURLConnection.HTTP_OK) {
                        val html = pageCon.inputStream.bufferedReader().use { it.readText() }
                        // Search for the download button link on Mediafire
                        val regex = Regex("href=\"(https?://[^\"]+)\"[^>]*id=\"downloadButton\"")
                        val match = regex.find(html)
                        if (match != null) {
                            finalUrlStr = match.groupValues[1]
                        } else {
                            val altRegex = Regex("id=\"downloadButton\"[\\s\\S]*?href=\"(https?://[^\"]+)\"")
                            val altMatch = altRegex.find(html)
                            if (altMatch != null) {
                                finalUrlStr = altMatch.groupValues[1]
                            }
                        }
                    }
                    pageCon.disconnect()
                }

                val url = URL(finalUrlStr)
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                // Simulate a browser to prevent 403 Forbidden some hosts use
                connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                connection.connect()

                if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                    throw Exception("Server returned HTTP ${connection.responseCode}")
                }

                val fileLength = connection.contentLength
                val dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                val file = File(dir, "update.apk")
                
                val input = connection.inputStream
                val output = FileOutputStream(file)
                val data = ByteArray(4096)
                var total: Long = 0
                var count: Int
                
                while (input.read(data).also { count = it } != -1) {
                    total += count.toLong()
                    // UI Update could go here with max=fileLength
                    output.write(data, 0, count)
                }
                
                output.flush()
                output.close()
                input.close()
                
                withContext(Dispatchers.Main) {
                    installApk(activity, file)
                }

            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    pbUpdate.visibility = View.GONE
                    Toast.makeText(activity, "فشل في تحميل التحديث، تأكد من صحة الرابط", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun installApk(context: Context, apkFile: File) {
        val intent = Intent(Intent.ACTION_VIEW)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
        
        val uri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            FileProvider.getUriForFile(context, "${context.packageName}.provider", apkFile)
        } else {
            Uri.fromFile(apkFile)
        }
        
        intent.setDataAndType(uri, "application/vnd.android.package-archive")
        context.startActivity(intent)
    }
}
