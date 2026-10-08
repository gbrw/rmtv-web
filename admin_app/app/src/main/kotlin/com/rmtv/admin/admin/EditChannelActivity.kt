package com.rmtv.admin.admin

import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.firestore.FirebaseFirestore
import com.rmtv.admin.databinding.ActivityEditChannelBinding

class EditChannelActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEditChannelBinding
    private val db = FirebaseFirestore.getInstance()
    private var channelId: String? = null
    private var networkId: String = ""
    private var isActive: Boolean = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEditChannelBinding.inflate(layoutInflater)
        setContentView(binding.root)

        networkId = intent.getStringExtra("networkId") ?: ""
        channelId = intent.getStringExtra("channelId")
        isActive = intent.getBooleanExtra("isActive", true)

        setupStreamTypeSpinner()

        if (channelId != null) {
            binding.etName.setText(intent.getStringExtra("name"))
            binding.etLogo.setText(intent.getStringExtra("logo"))
            binding.etUrl.setText(intent.getStringExtra("url"))
            binding.etOrder.setText(intent.getIntExtra("order", 0).toString())
            
            val type = intent.getStringExtra("type") ?: "direct"
            val index = if (type == "youtube") 1 else 0
            binding.spStreamType.setSelection(index)
            
            binding.btnSave.text = "تحديث القناة"
        } else {
            // Auto order for new channel
            db.collection("channels")
                .whereEqualTo("networkId", networkId)
                .get()
                .addOnSuccessListener { snapshot ->
                    val maxOrder = snapshot.documents.mapNotNull { it.getLong("order")?.toInt() }.maxOrNull() ?: 0
                    binding.etOrder.setText((maxOrder + 1).toString())
                }
        }

        binding.btnSave.setOnClickListener { saveChannel() }
        binding.btnCancel.setOnClickListener { finish() }
    }

    private fun setupStreamTypeSpinner() {
        val types = arrayOf("رابط مباشر (m3u8/ts/mp4)", "رابط يوتيوب")
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, types)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        binding.spStreamType.adapter = adapter
    }

    private fun saveChannel() {
        val name = binding.etName.text.toString().trim()
        val logo = binding.etLogo.text.toString().trim()
        val url = binding.etUrl.text.toString().trim()
        val order = binding.etOrder.text.toString().toIntOrNull() ?: 0
        val type = if (binding.spStreamType.selectedItemPosition == 1) "youtube" else "direct"

        if (name.isEmpty() || url.isEmpty()) {
            Toast.makeText(this, "أكمل البيانات المطلوبة", Toast.LENGTH_SHORT).show()
            return
        }

        val data = hashMapOf(
            "name" to name,
            "logoUrl" to logo,
            "url" to url,
            "streamType" to type,
            "networkId" to networkId,
            "order" to order,
            "isActive" to isActive
        )

        val task = if (channelId == null) {
            db.collection("channels").add(data)
        } else {
            db.collection("channels").document(channelId!!).set(data)
        }

        task.addOnSuccessListener {
            Toast.makeText(this, "تم الحفظ", Toast.LENGTH_SHORT).show()
            finish()
        }.addOnFailureListener {
            Toast.makeText(this, "خطأ: ${it.message}", Toast.LENGTH_SHORT).show()
        }
    }
}