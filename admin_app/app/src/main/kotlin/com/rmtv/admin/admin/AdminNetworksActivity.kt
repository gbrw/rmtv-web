package com.rmtv.admin.admin

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.rmtv.admin.R
import com.rmtv.admin.databinding.ActivityAdminNetworksBinding
import com.rmtv.admin.models.Network

class AdminNetworksActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAdminNetworksBinding
    private val db = FirebaseFirestore.getInstance()
    
    private val adapter = AdminNetworksAdapter(
        onEditClick = { network -> editNetwork(network) },
        onDeleteClick = { network -> deleteNetwork(network) },
        onNetworkClick = { network -> openChannelAdmin(network) },
        onToggleActiveClick = { network, isChecked -> toggleNetworkActive(network, isChecked) }
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAdminNetworksBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.rvAdminNetworks.layoutManager = LinearLayoutManager(this)
        binding.rvAdminNetworks.adapter = adapter

        binding.toolbar.setNavigationOnClickListener { finish() }

        binding.btnAddNetwork.setOnClickListener {
            startActivity(Intent(this, EditNetworkActivity::class.java))
        }

        binding.btnUpdateSystem.setOnClickListener {
            UpdateManagerDialog(this).show()
        }

        loadNetworks()
    }

    private fun loadNetworks() {
        binding.progressBar.visibility = View.VISIBLE
        db.collection("networks")
            .orderBy("order", Query.Direction.ASCENDING)
            .addSnapshotListener { snapshot, _ ->
                binding.progressBar.visibility = View.GONE
                val networks = snapshot?.documents?.mapNotNull { doc ->
                    Network(
                        id = doc.id,
                        name = doc.getString("name") ?: "",
                        logoUrl = doc.getString("logoUrl") ?: "",
                        order = (doc.getLong("order") ?: 0).toInt(),
                        isActive = doc.getBoolean("isActive") ?: true
                    )
                } ?: emptyList()
                adapter.submitList(networks)
            }
    }

    private fun toggleNetworkActive(network: Network, isActive: Boolean) {
        db.collection("networks").document(network.id)
            .update("isActive", isActive)
            .addOnFailureListener {
                Toast.makeText(this, "فشل في تحديث حالة الباقة", Toast.LENGTH_SHORT).show()
                // Re-load will happen via snapshot listener or we can manually refresh
            }
    }

    private fun editNetwork(network: Network) {
        val intent = Intent(this, EditNetworkActivity::class.java).apply {
            putExtra("networkId", network.id)
            putExtra("networkName", network.name)
            putExtra("networkLogo", network.logoUrl)
            putExtra("networkOrder", network.order)
            putExtra("isActive", network.isActive)
        }
        startActivity(intent)
    }

    private fun deleteNetwork(network: Network) {
        // Simple confirmation can be added
        db.collection("networks").document(network.id).delete()
    }

    private fun openChannelAdmin(network: Network) {
        val intent = Intent(this, AdminChannelsActivity::class.java).apply {
            putExtra("networkId", network.id)
            putExtra("networkName", network.name)
        }
        startActivity(intent)
    }
}