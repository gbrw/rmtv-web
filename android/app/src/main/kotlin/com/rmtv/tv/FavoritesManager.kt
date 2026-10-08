package com.rmtv.tv

import android.content.Context
import android.content.SharedPreferences

object FavoritesManager {
    private const val PREFS_NAME = "rmtv_favorites"
    private const val KEY_FAVORITE_IDS = "favorite_channel_ids"
    
    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getFavoriteIds(context: Context): MutableSet<String> {
        val savedSet = getPrefs(context).getStringSet(KEY_FAVORITE_IDS, emptySet()) ?: emptySet()
        return java.util.HashSet<String>(savedSet)
    }

    fun toggleFavorite(context: Context, channelId: String): Boolean {
        val prefs = getPrefs(context)
        val favorites = getFavoriteIds(context)
        
        val isFavorite = if (favorites.contains(channelId)) {
            favorites.remove(channelId)
            false
        } else {
            favorites.add(channelId)
            true
        }
        
        prefs.edit().putStringSet(KEY_FAVORITE_IDS, favorites).commit()
        return isFavorite
    }
    
    fun isFavorite(context: Context, channelId: String): Boolean {
        return getFavoriteIds(context).contains(channelId)
    }
}