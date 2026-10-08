package com.rmtv.tv.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.rmtv.tv.R
import com.rmtv.tv.models.Channel

/**
 * قائمة القنوات (صفوف بدل المربعات).
 * compact = true للقائمة الجانبية داخل المشغل.
 * الضغطة الطويلة تفتح خيارات المشغلات الخارجية.
 */
class ChannelsAdapter(
    private val compact: Boolean = false,
    private val onChannelClick: (Channel) -> Unit,
    private val onChannelLongClick: ((Channel) -> Unit)? = null
) : ListAdapter<Channel, ChannelsAdapter.ChannelViewHolder>(ChannelDiffCallback()) {

    private var allChannels: List<Channel> = emptyList()
    private var numbers: Map<String, Int> = emptyMap()

    /** القناة التي تعمل الآن (تُميَّز في قائمة المشغل) */
    var playingId: String? = null
        set(value) {
            val old = field
            field = value
            currentList.forEachIndexed { i, c -> if (c.id == old || c.id == value) notifyItemChanged(i) }
        }

    fun submitChannels(list: List<Channel>) {
        allChannels = list
        // رقم القناة ثابت حسب ترتيبها في الباقة حتى أثناء البحث
        numbers = list.mapIndexed { i, c -> c.id to i + 1 }.toMap()
        super.submitList(list)
    }

    fun filter(query: String) {
        val q = query.trim()
        super.submitList(if (q.isEmpty()) allChannels else allChannels.filter { it.name.contains(q, ignoreCase = true) })
    }

    init {
        setHasStableIds(true)
    }

    override fun getItemId(position: Int): Long = getItem(position).id.hashCode().toLong()

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ChannelViewHolder {
        val layout = if (compact) R.layout.item_player_channel else R.layout.item_channel_row
        val view = LayoutInflater.from(parent.context).inflate(layout, parent, false)
        return ChannelViewHolder(view)
    }

    override fun onBindViewHolder(holder: ChannelViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class ChannelViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val root: View = view.findViewById(R.id.rowRoot)
        private val tvNumber: TextView = view.findViewById(R.id.tvNumber)
        private val tvName: TextView = view.findViewById(R.id.tvChannelName)
        private val ivLogo: ImageView = view.findViewById(R.id.ivChannelLogo)
        private val playingDot: View? = view.findViewById(R.id.playingDot)

        fun bind(channel: Channel) {
            tvNumber.text = (numbers[channel.id] ?: (bindingAdapterPosition + 1)).toString()
            tvName.text = channel.name

            Glide.with(ivLogo)
                .load(channel.logoUrl.ifBlank { null })
                .placeholder(R.drawable.ic_tv)
                .error(R.drawable.ic_tv)
                .diskCacheStrategy(DiskCacheStrategy.ALL)
                .dontAnimate()
                .fitCenter()
                .into(ivLogo)

            val isPlaying = channel.id == playingId
            playingDot?.visibility = if (isPlaying) View.VISIBLE else View.GONE
            if (compact) root.setBackgroundResource(if (isPlaying) R.drawable.bg_row_playing else R.drawable.bg_row)

            root.setOnClickListener { onChannelClick(channel) }
            root.setOnLongClickListener {
                onChannelLongClick?.invoke(channel)
                onChannelLongClick != null
            }
        }
    }

    class ChannelDiffCallback : DiffUtil.ItemCallback<Channel>() {
        override fun areItemsTheSame(oldItem: Channel, newItem: Channel) = oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: Channel, newItem: Channel) = oldItem == newItem
    }
}
