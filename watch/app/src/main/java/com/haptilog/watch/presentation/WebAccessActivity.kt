package com.haptilog.watch.presentation

import android.os.Bundle
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.*
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.haptilog.watch.BuildConfig
import com.haptilog.watch.sync.CloudClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/** Pairing is deliberately separate from capture and never shares refresh tokens. */
class WebAccessActivity : ComponentActivity() {
    override fun onStop() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        super.onStop()
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                val scope = rememberCoroutineScope()
                val list = rememberScalingLazyListState()
                val focus = remember { FocusRequester() }
                LaunchedEffect(Unit) { focus.requestFocus() }
                var code by remember { mutableStateOf<JSONObject?>(null) }
                var connections by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
                var busy by remember { mutableStateOf(false) }
                var error by remember { mutableStateOf<String?>(null) }
                var remaining by remember { mutableStateOf(0L) }
                var connected by remember { mutableStateOf(false) }
                var browsersLoaded by remember { mutableStateOf(false) }
                suspend fun cloud(action: String): JSONObject = withContext(Dispatchers.IO) {
                    val client = CloudClient(this@WebAccessActivity)
                    val (token, _) = client.authenticate()
                    JSONObject(client.request("/functions/v1/watch-access", "POST", JSONObject().put("action", action).toString().toByteArray(), token))
                }
                suspend fun refreshConnections() = withContext(Dispatchers.IO) {
                    val client = CloudClient(this@WebAccessActivity)
                    val (token, owner) = client.authenticate()
                    val rows = JSONArray(client.request("/rest/v1/portal_connections?owner_user_id=eq.$owner&revoked_at=is.null&expires_at=gt.${Instant.now()}&order=created_at.desc&limit=20", "GET", token = token))
                    List(rows.length()) { rows.getJSONObject(it) }
                }
                fun cancel() {
                    if (busy) return
                    scope.launch {
                        busy = true
                        try {
                            if (code != null) cloud("cancel")
                        } catch (_: Exception) {
                            Toast.makeText(this@WebAccessActivity, "Code could not be cancelled; it expires automatically within 5 minutes.", Toast.LENGTH_LONG).show()
                        } finally {
                            code = null
                            busy = false
                            finish()
                        }
                    }
                }
                BackHandler { cancel() }
                LaunchedEffect(code) {
                    val issued = code ?: return@LaunchedEffect
                    val expires = issued.getString("expires_at")
                    val expiresAt = Instant.parse(expires).toEpochMilli()
                    lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                        try {
                            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            val wakeUntil = System.currentTimeMillis() + 60_000
                            coroutineScope {
                                launch {
                                    while (System.currentTimeMillis() < expiresAt) {
                                        remaining = ((expiresAt - System.currentTimeMillis()) / 1000).coerceAtLeast(0)
                                        if (System.currentTimeMillis() >= wakeUntil) window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                                        delay(1000)
                                    }
                                    remaining = 0
                                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                                }
                                launch {
                                    while (code === issued) {
                                        try {
                                            val fresh = refreshConnections()
                                            if (code === issued) {
                                                connections = fresh
                                                browsersLoaded = true
                                                if (fresh.any { pairedDuringCode(expires, it.getString("created_at")) }) {
                                                    connected = true
                                                    code = null
                                                    error = null
                                                    break
                                                }
                                            }
                                        } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled
                                        } catch (_: Exception) { /* Retain the code during temporary network loss. */ }
                                        if (System.currentTimeMillis() >= expiresAt) break
                                        delay(5000)
                                    }
                                }
                            }
                        } finally {
                            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        }
                    }
                }
                DisposableEffect(Unit) { onDispose { window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) } }
                Scaffold(positionIndicator = { PositionIndicator(scalingLazyListState = list) }) {
                    ScalingLazyColumn(state = list, horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp)
                            .focusRequester(focus).focusable().onRotaryScrollEvent { event ->
                                scope.launch { list.scrollBy(event.verticalScrollPixels) }; true
                            }) {
                        item { Text("Web access", fontSize = 18.sp) }
                        item { Text(BuildConfig.WEB_PORTAL_URL.removePrefix("https://"), fontSize = 13.sp, textAlign = TextAlign.Center) }
                        item { Text("Connect a browser to review your recordings. No phone needed.", fontSize = 12.sp, textAlign = TextAlign.Center) }
                        if (connected) item { Text("Browser connected", fontSize = 17.sp, textAlign = TextAlign.Center) }
                        if (code != null) {
                            item { Text("Enter this code on the web", fontSize = 13.sp, textAlign = TextAlign.Center) }
                            item { Text(if (remaining > 0) code!!.getString("code").chunked(3).joinToString(" ") else "Expired", fontSize = 27.sp, fontFamily = FontFamily.Monospace) }
                            if (remaining > 0) item { Text("${remaining / 60}:${(remaining % 60).toString().padStart(2, '0')} remaining", fontSize = 12.sp) }
                        }
                        item {
                            FlexibleChip(enabled = !busy && CloudClient.configured, onClick = {
                                scope.launch {
                                    busy = true; error = null
                                    try {
                                        val issued = cloud("issue")
                                        remaining = ((Instant.parse(issued.getString("expires_at")).toEpochMilli() - System.currentTimeMillis()) / 1000).coerceAtLeast(0)
                                        connected = false
                                        code = issued
                                    }
                                    catch (_: Exception) { error = "Cannot create code. Check Wi-Fi; wait a minute before retrying." }
                                    finally { busy = false }
                                }
                            }, label = { Text(maxLines = Int.MAX_VALUE, text = if (busy) "Connecting…" else if (connected) "Pair another browser" else if (code == null) "Create code" else "Create new code") })
                        }
                        if (error != null) item { Text(error!!, fontSize = 12.sp, textAlign = TextAlign.Center) }
                        item {
                            FlexibleChip(enabled = !busy, onClick = {
                                scope.launch {
                                    busy = true; error = null
                                    try { connections = refreshConnections(); browsersLoaded = true }
                                    catch (_: Exception) { error = "Cannot load browsers. Check connection." }
                                    finally { busy = false }
                                }
                            }, label = { Text(maxLines = Int.MAX_VALUE, text = "Browsers") })
                        }
                        if (browsersLoaded && connections.isEmpty()) item { Text("No connected browsers", fontSize = 12.sp, textAlign = TextAlign.Center) }
                        for (connection in connections) {
                            item {
                                FlexibleChip(enabled = !busy, onClick = {
                                    scope.launch {
                                        busy = true
                                        try {
                                            withContext(Dispatchers.IO) {
                                                val client = CloudClient(this@WebAccessActivity)
                                                val (token, _) = client.authenticate()
                                                client.request("/rest/v1/portal_connections?session_id=eq.${connection.getString("session_id")}", "PATCH",
                                                    JSONObject().put("revoked_at", Instant.now().toString()).toString().toByteArray(), token)
                                            }
                                            connections = refreshConnections()
                                        } catch (_: Exception) { error = "Revoke failed. Try again online." }
                                        finally { busy = false }
                                    }
                                }, label = { Text(maxLines = Int.MAX_VALUE, text = "Revoke access") }, secondaryLabel = { Text(connection.getString("created_at").take(10)) })
                            }
                        }
                        item { FlexibleChip(enabled = !busy, onClick = { cancel() }, label = { Text(maxLines = Int.MAX_VALUE, text = if (code == null) "Close" else "Cancel code") }) }
                    }
                }
            }
        }
    }
}
