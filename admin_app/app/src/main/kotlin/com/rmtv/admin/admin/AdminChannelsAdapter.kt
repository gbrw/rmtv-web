package com.rmtv.admin.admin

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.rmtv.admin.R
import com.rmtv.admin.databinding.ItemAdminChannelBinding
import com.rmtv.admin.models.Channel

class AdminChannelsAdapter(
    private val onEditClick: (Channel) -> Unit,
    private val onDeleteClick: (Channel) -> Unit,
    private val onToggleActiveClick: (Channel, Boolean) -> Unit
) : RecyclerView.Adapter<AdminChannelsAdapter.ViewHolder>() {

    private var items = listOf<Channel>()

    fun submitList(newItems: List<Channel>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemAdminChannelBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount() = items.size

    inner class ViewHolder(private val binding: ItemAdminChannelBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(channel: Channel) {
            binding.tvChannelName.text = channel.name
            Glide.with(binding.root.context)
                .load(channel.logoUrl)
                .placeholder(R.drawable.ic_tv)
                .into(binding.ivChannelLogo)

            binding.switchActive.setOnCheckedChangeListener(null)
            binding.switchActive.isChecked = channel.isActive
            binding.switchActive.setOnCheckedChangeListener { _, isChecked ->
                onToggleActiveClick(channel, isChecked)
            }

            binding.btnEdit.setOnClickListener { onEditClick(channel) }
            binding.btnDelete.setOnClickListener { onDeleteClick(channel) }
        }
    }
}