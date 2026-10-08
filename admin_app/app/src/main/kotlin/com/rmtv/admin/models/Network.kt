package com.rmtv.admin.models

data class Network(
    val id: String = "",
    val name: String = "",
    val logoUrl: String = "",
    val order: Int = 0,
    val isActive: Boolean = true
)