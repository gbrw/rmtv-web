import re

with open("e:/rmtv_tv/android/app/src/main/kotlin/com/rmtv/tv/PlayerActivity.kt", "r", encoding="utf-8") as f:
    code = f.read()
    
# Import extension functions if missing
imports = """import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody"""
code = code.replace("import okhttp3.OkHttpClient\nimport okhttp3.Request", imports)

# Replace the okhttp call
old_code = """                val requestInfo = Request.Builder()
                    .url("https://co.wuk.sh/api/json")
                    .post(okhttp3.RequestBody.create(
                        okhttp3.MediaType.parse("application/json"),
                        "{\\"url\\":\\"https://www.youtube.com/watch?v=$videoId\\",\\"vCodec\\":\\"h264\\",\\"vQuality\\":\\"720\\",\\"isAudioOnly\\":false,\\"isNoAudio\\":false}"
                    ))
                    .header("Accept", "application/json")
                    .build()

                val response = okHttpClient.newCall(requestInfo).execute()
                val resBody = response.body()?.string()"""

new_code = """                val mediaType = "application/json".toMediaTypeOrNull()
                val bodyStr = "{\\"url\\":\\"https://www.youtube.com/watch?v=$videoId\\",\\"vCodec\\":\\"h264\\",\\"vQuality\\":\\"720\\",\\"isAudioOnly\\":false,\\"isNoAudio\\":false}"
                val reqBody = bodyStr.toRequestBody(mediaType)
                
                val requestInfo = Request.Builder()
                    .url("https://co.wuk.sh/api/json")
                    .post(reqBody)
                    .header("Accept", "application/json")
                    .build()

                val response = okHttpClient.newCall(requestInfo).execute()
                val resBody = response.body?.string()"""

code = code.replace(old_code, new_code)

with open("e:/rmtv_tv/android/app/src/main/kotlin/com/rmtv/tv/PlayerActivity.kt", "w", encoding="utf-8") as f:
    f.write(code)
