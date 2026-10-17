package com.haptilog.watch.presentation

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.*
import com.haptilog.watch.BuildConfig
import com.haptilog.watch.support.AppReports
import com.haptilog.watch.support.ReportUploadWorker
import com.haptilog.watch.sync.CloudClient
import com.haptilog.watch.sync.RecordingSyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Version and support remain available offline, independently of recording count. */
class SettingsActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                val scope = rememberCoroutineScope()
                val list = rememberScalingLazyListState()
                val focus = remember { FocusRequester() }
                var cloud by remember { mutableStateOf(RecordingSyncWorker.enabled(this)) }
                var crashes by remember { mutableStateOf(AppReports.crashReportsEnabled(this)) }
                var reporting by rememberSaveable { mutableStateOf(false) }
                var description by rememberSaveable { mutableStateOf("") }
                var busy by remember { mutableStateOf(false) }
                var notice by remember { mutableStateOf<String?>(null) }
                var queued by remember { mutableStateOf(AppReports.pending(this)) }
                DisposableEffect(Unit) {
                    val observer = LifecycleEventObserver { _, event ->
                        if (event == Lifecycle.Event.ON_RESUME) queued = AppReports.pending(this@SettingsActivity)
                    }
                    lifecycle.addObserver(observer)
                    onDispose { lifecycle.removeObserver(observer) }
                }
                BackHandler(enabled = reporting && !busy) { reporting = false; notice = null }
                LaunchedEffect(reporting) { list.scrollToItem(0); focus.requestFocus() }
                Scaffold(positionIndicator = { PositionIndicator(scalingLazyListState = list) }) {
                    ScalingLazyColumn(
                        state = list,
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxSize().background(Color.Black).padding(horizontal = 12.dp)
                            .focusRequester(focus).focusable().onRotaryScrollEvent { event ->
                                scope.launch { list.scrollBy(event.verticalScrollPixels) }; true
                            }
                    ) {
                        item { Text(if (reporting) "Report an issue" else "Settings & help", fontSize = 18.sp, textAlign = TextAlign.Center) }
                        item { Text("HaptiLog ${BuildConfig.VERSION_NAME}\nBuild ${BuildConfig.VERSION_CODE}", fontSize = 14.sp, textAlign = TextAlign.Center) }
                        notice?.let { message -> item { Text(message, fontSize = 12.sp, textAlign = TextAlign.Center) } }
                        if (reporting) {
                            item { Text("Tap to describe the problem.", fontSize = 12.sp, textAlign = TextAlign.Center) }
                            item {
                                BasicTextField(
                                    value = description,
                                    onValueChange = { description = it.take(1000) },
                                    enabled = !busy,
                                    textStyle = TextStyle(color = Color.White, fontSize = 14.sp),
                                    modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp)
                                        .background(Color(0xFF242428)).padding(12.dp),
                                    decorationBox = { field ->
                                        if (description.isEmpty()) Text("Describe the problem", fontSize = 14.sp, color = Color.LightGray)
                                        field()
                                    }
                                )
                            }
                            item { Text("Includes app build, watch model and Android version. No recordings or location. Avoid private details.", fontSize = 12.sp, textAlign = TextAlign.Center) }
                            item {
                                Chip(enabled = !busy && description.isNotBlank() && CloudClient.configured,
                                    label = { Text(if (busy) "Saving…" else "Send report") },
                                    onClick = {
                                        busy = true
                                        scope.launch {
                                            try {
                                                val id = withContext(Dispatchers.IO) { AppReports.save(this@SettingsActivity, "issue", description.trim())!! }
                                                ReportUploadWorker.schedule(this@SettingsActivity)
                                                description = ""
                                                notice = "Saved on watch · ${id.take(8)}. Waiting to send."
                                                reporting = false
                                                queued = AppReports.pending(this@SettingsActivity)
                                            } catch (_: Exception) {
                                                notice = if (AppReports.pending(this@SettingsActivity) >= 10)
                                                    "Report queue full. Go back and retry queued reports when online. Your draft is kept."
                                                else "Could not save report. Your draft is kept. Try again."
                                            }
                                            finally { busy = false }
                                        }
                                    })
                            }
                            item { CompactChip(enabled = !busy, onClick = { reporting = false; notice = null }, label = { Text("Cancel") }) }
                        } else {
                            item {
                                Chip(enabled = CloudClient.configured, onClick = {
                                    startActivity(Intent(this@SettingsActivity, WebAccessActivity::class.java))
                                }, label = { Text("Web access") })
                            }
                            item {
                                ToggleChip(checked = cloud, enabled = CloudClient.configured,
                                    onCheckedChange = { enabled ->
                                        if (enabled) RecordingSyncWorker.enable(this@SettingsActivity) else RecordingSyncWorker.disable(this@SettingsActivity)
                                        cloud = enabled
                                    }, label = { Text("Cloud sync") },
                                    toggleControl = { Switch(checked = cloud) })
                            }
                            if (!cloud) item { Text("Recording sync is paused. Support reports can still send.", fontSize = 12.sp, textAlign = TextAlign.Center) }
                            item {
                                Chip(onClick = {
                                    try {
                                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName")))
                                    } catch (_: ActivityNotFoundException) { notice = "Play Store unavailable on this watch." }
                                }, label = { Text("Open Play Store") })
                            }
                            item { Text("Check for updates in the store.", fontSize = 12.sp, textAlign = TextAlign.Center) }
                            item { Chip(onClick = { reporting = true; notice = null }, label = { Text("Report an issue") }) }
                            item {
                                ToggleChip(checked = crashes, onCheckedChange = { enabled ->
                                    AppReports.setCrashReportsEnabled(this@SettingsActivity, enabled)
                                    crashes = enabled
                                    queued = AppReports.pending(this@SettingsActivity)
                                }, label = { Text("Crash reports") }, toggleControl = { Switch(checked = crashes) })
                            }
                            item { Text("Optional. Sends app crash types and code locations after restart. No recordings, location, credentials or exception messages. Turning off stops future reports and removes queued crashes.", fontSize = 12.sp, textAlign = TextAlign.Center) }
                            if (queued > 0) item {
                                CompactChip(onClick = {
                                    queued = AppReports.pending(this@SettingsActivity)
                                    ReportUploadWorker.schedule(this@SettingsActivity)
                                    notice = if (queued == 0) "All queued reports sent." else "$queued queued. Will retry online."
                                }, label = { Text("Retry reports ($queued)") })
                            }
                        }
                        if (!CloudClient.configured) item { Text("Reporting needs cloud configuration.", fontSize = 12.sp, textAlign = TextAlign.Center) }
                        item { Spacer(Modifier.height(24.dp)) }
                    }
                }
            }
        }
    }
}
