package com.rmtv.tv.models

data class Channel(
    val id: String = "",
    val name: String = "",
    val logoUrl: String = "",
    val url: String = "",
    val streamType: String = "direct", // "direct" أو "youtube"
    val networkId: String = "",
    val order: Int = 0
)
