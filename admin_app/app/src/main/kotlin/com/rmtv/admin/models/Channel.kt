package com.rmtv.admin.models

data class Channel(
    val id: String = "",
    val name: String = "",
    val logoUrl: String = "",
    val url: String = "",
    val streamType: String = "direct",
    val networkId: String = "",
    val order: Int = 0,
    val isActive: Boolean = true
)