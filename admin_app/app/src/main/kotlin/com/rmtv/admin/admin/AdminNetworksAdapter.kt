package com.rmtv.admin.admin

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.rmtv.admin.R
import com.rmtv.admin.databinding.ItemAdminNetworkBinding
import com.rmtv.admin.models.Network

class AdminNetworksAdapter(
    private val onEditClick: (Network) -> Unit,
    private val onDeleteClick: (Network) -> Unit,
    private val onNetworkClick: (Network) -> Unit,
    private val onToggleActiveClick: (Network, Boolean) -> Unit
) : RecyclerView.Adapter<AdminNetworksAdapter.ViewHolder>() {

    private var items = listOf<Network>()

    fun submitList(newItems: List<Network>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemAdminNetworkBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount() = items.size

    inner class ViewHolder(private val binding: ItemAdminNetworkBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(network: Network) {
            binding.tvNetworkName.text = network.name
            Glide.with(binding.root.context)
                .load(network.logoUrl)
                .placeholder(R.drawable.ic_tv)
                .into(binding.ivNetworkLogo)

            binding.switchActive.setOnCheckedChangeListener(null)
            binding.switchActive.isChecked = network.isActive
            binding.switchActive.setOnCheckedChangeListener { _, isChecked ->
                onToggleActiveClick(network, isChecked)
            }

            binding.btnEdit.setOnClickListener { onEditClick(network) }
            binding.btnDelete.setOnClickListener { onDeleteClick(network) }
            binding.root.setOnClickListener { onNetworkClick(network) }
        }
    }
}