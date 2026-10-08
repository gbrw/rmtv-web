package com.rmtv.admin.admin

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.firebase.firestore.FirebaseFirestore
import com.rmtv.admin.databinding.ActivityAdminChannelsBinding
import com.rmtv.admin.models.Channel

class AdminChannelsActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAdminChannelsBinding
    private val db = FirebaseFirestore.getInstance()
    private var networkId: String = ""
    private var networkName: String = ""
    
    private val adapter = AdminChannelsAdapter(
        onEditClick = { channel -> editChannel(channel) },
        onDeleteClick = { channel -> deleteChannel(channel) },
        onToggleActiveClick = { channel, isChecked -> toggleChannelActive(channel, isChecked) }
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAdminChannelsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        networkId = intent.getStringExtra("networkId") ?: ""
        networkName = intent.getStringExtra("networkName") ?: ""

        binding.tvNetworkHeader.text = "قنوات: $networkName"
        binding.rvAdminChannels.layoutManager = LinearLayoutManager(this)
        binding.rvAdminChannels.adapter = adapter

        binding.toolbar.setNavigationOnClickListener { finish() }

        binding.btnAddChannel.setOnClickListener {
            val intent = Intent(this, EditChannelActivity::class.java).apply {
                putExtra("networkId", networkId)
            }
            startActivity(intent)
        }

        loadChannels()
    }

    private fun loadChannels() {
        binding.progressBar.visibility = View.VISIBLE
        db.collection("channels")
            .whereEqualTo("networkId", networkId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Toast.makeText(this, "خطأ: ${error.message}", Toast.LENGTH_SHORT).show()
                    return@addSnapshotListener
                }
                binding.progressBar.visibility = View.GONE
                val channels = snapshot?.documents?.mapNotNull { doc ->
                    Channel(
                        id = doc.id,
                        name = doc.getString("name") ?: "",
                        logoUrl = doc.getString("logoUrl") ?: "",
                        url = doc.getString("url") ?: "",
                        streamType = doc.getString("streamType") ?: "direct",
                        networkId = doc.getString("networkId") ?: "",
                        order = (doc.getLong("order") ?: 0).toInt(),
                        isActive = doc.getBoolean("isActive") ?: true
                    )
                }?.sortedBy { it.order } ?: emptyList()
                
                if (channels.isEmpty()) {
                    Toast.makeText(this, "لا توجد قنوات في هذه الباقة", Toast.LENGTH_SHORT).show()
                }
                
                adapter.submitList(channels)
            }
    }

    private fun toggleChannelActive(channel: Channel, isActive: Boolean) {
        db.collection("channels").document(channel.id)
            .update("isActive", isActive)
            .addOnFailureListener {
                Toast.makeText(this, "فشل في تحديث حالة القناة", Toast.LENGTH_SHORT).show()
                // Re-load will happen via snapshot listener or we can manually refresh
            }
    }

    private fun editChannel(channel: Channel) {
        val intent = Intent(this, EditChannelActivity::class.java).apply {
            putExtra("channelId", channel.id)
            putExtra("name", channel.name)
            putExtra("logo", channel.logoUrl)
            putExtra("url", channel.url)
            putExtra("type", channel.streamType)
            putExtra("networkId", channel.networkId)
            putExtra("order", channel.order)
            putExtra("isActive", channel.isActive)
        }
        startActivity(intent)
    }

    private fun deleteChannel(channel: Channel) {
        db.collection("channels").document(channel.id).delete()
    }
}