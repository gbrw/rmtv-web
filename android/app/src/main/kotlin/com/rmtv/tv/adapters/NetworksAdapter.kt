package com.rmtv.tv.adapters

import android.annotation.SuppressLint
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.rmtv.tv.R
import com.rmtv.tv.databinding.ItemNetworkRowBinding
import com.rmtv.tv.models.Network

/** قائمة الباقات (صفوف مثل قائمة القنوات) */
class NetworksAdapter(
    private val onNetworkClick: (Network) -> Unit
) : RecyclerView.Adapter<NetworksAdapter.NetworkViewHolder>() {

    private val networks = mutableListOf<Network>()
    private val filteredNetworks = mutableListOf<Network>()

    init {
        setHasStableIds(true)
    }

    @SuppressLint("NotifyDataSetChanged")
    fun submitNetworks(data: List<Network>) {
        networks.clear()
        networks.addAll(data)
        filteredNetworks.clear()
        filteredNetworks.addAll(data)
        notifyDataSetChanged()
    }

    @SuppressLint("NotifyDataSetChanged")
    fun filter(query: String) {
        val q = query.trim()
        filteredNetworks.clear()
        filteredNetworks.addAll(if (q.isEmpty()) networks else networks.filter { it.name.contains(q, ignoreCase = true) })
        notifyDataSetChanged()
    }

    override fun getItemId(position: Int): Long = filteredNetworks[position].id.hashCode().toLong()

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): NetworkViewHolder {
        val binding = ItemNetworkRowBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return NetworkViewHolder(binding, onNetworkClick)
    }

    override fun onBindViewHolder(holder: NetworkViewHolder, position: Int) {
        holder.bind(filteredNetworks[position])
    }

    override fun getItemCount(): Int = filteredNetworks.size

    class NetworkViewHolder(
        private val binding: ItemNetworkRowBinding,
        private val onNetworkClick: (Network) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(network: Network) {
            binding.tvNetworkName.text = network.name

            Glide.with(binding.ivNetworkLogo)
                .load(network.logoUrl.ifBlank { null })
                .placeholder(R.drawable.ic_tv)
                .error(R.drawable.ic_tv)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .dontAnimate()
                .fitCenter()
                .into(binding.ivNetworkLogo)

            binding.rowRoot.setOnClickListener { onNetworkClick(network) }
        }
    }
}
