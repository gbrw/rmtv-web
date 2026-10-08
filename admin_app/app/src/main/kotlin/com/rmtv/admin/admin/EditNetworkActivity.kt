package com.rmtv.admin.admin

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.firestore.FirebaseFirestore
import com.rmtv.admin.R
import com.rmtv.admin.databinding.ActivityEditNetworkBinding

class EditNetworkActivity : AppCompatActivity() {

    private lateinit var binding: ActivityEditNetworkBinding
    private val db = FirebaseFirestore.getInstance()
    private var networkId: String? = null
    private var isActive: Boolean = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityEditNetworkBinding.inflate(layoutInflater)
        setContentView(binding.root)

        networkId = intent.getStringExtra("networkId")
        isActive = intent.getBooleanExtra("isActive", true)
        
        if (networkId != null) {
            binding.etName.setText(intent.getStringExtra("networkName"))
            binding.etLogo.setText(intent.getStringExtra("networkLogo"))
            binding.etOrder.setText(intent.getIntExtra("networkOrder", 0).toString())
            binding.btnSave.text = "تحديث"
        } else {
            // Auto order for new network
            db.collection("networks")
                .get()
                .addOnSuccessListener { snapshot ->
                    val maxOrder = snapshot.documents.mapNotNull { it.getLong("order")?.toInt() }.maxOrNull() ?: 0
                    binding.etOrder.setText((maxOrder + 1).toString())
                }
        }

        binding.btnSave.setOnClickListener { saveNetwork() }
        binding.btnCancel.setOnClickListener { finish() }
    }

    private fun saveNetwork() {
        val name = binding.etName.text.toString().trim()
        val logo = binding.etLogo.text.toString().trim()
        val order = binding.etOrder.text.toString().toIntOrNull() ?: 0

        if (name.isEmpty()) {
            Toast.makeText(this, "أدخل الاسم", Toast.LENGTH_SHORT).show()
            return
        }

        val data = hashMapOf(
            "name" to name,
            "logoUrl" to logo,
            "order" to order,
            "isActive" to isActive
        )

        val task = if (networkId == null) {
            db.collection("networks").add(data)
        } else {
            db.collection("networks").document(networkId!!).set(data)
        }

        task.addOnSuccessListener {
            Toast.makeText(this, "تم الحفظ بنجاح", Toast.LENGTH_SHORT).show()
            finish()
        }.addOnFailureListener {
            Toast.makeText(this, "فشل الحفظ: ${it.message}", Toast.LENGTH_SHORT).show()
        }
    }
}