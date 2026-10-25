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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.painterResource
import com.haptilog.watch.R
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.*
import com.haptilog.watch.BuildConfig
import com.haptilog.watch.data.HapticIntensity
import com.haptilog.watch.data.HapticPreferences
import com.haptilog.watch.service.HapticHeartbeatManager
import com.haptilog.watch.support.AppReports
import com.haptilog.watch.support.ReportUploadWorker
import com.haptilog.watch.sync.CloudConsent
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
            LegacyHaptiLogTheme {
                val scope = rememberCoroutineScope()
                val list = rememberScalingLazyListState(initialCenterItemIndex = 0)
                val focus = remember { FocusRequester() }
                var cloud by remember { mutableStateOf(RecordingSyncWorker.enabled(this)) }
                var crashes by remember { mutableStateOf(AppReports.crashReportsEnabled(this)) }
                var hapticIntensity by remember { mutableStateOf(HapticPreferences.getIntensity(this)) }
                val hapticManager = remember { HapticHeartbeatManager(this) }
                var consenting by rememberSaveable { mutableStateOf(false) }
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
                BackHandler(enabled = (reporting || consenting) && !busy) { reporting = false; consenting = false; notice = null }
                LaunchedEffect(reporting, consenting) { list.scrollToItem(0); focus.requestFocus() }
                Scaffold(positionIndicator = { PositionIndicator(scalingLazyListState = list) }) {
                    ScalingLazyColumn(
                        state = list,
                        autoCentering = null,
                        contentPadding = PaddingValues(top = 36.dp, bottom = 56.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxSize().background(Color.Black).padding(horizontal = 18.dp)
                            .focusRequester(focus).focusable().onRotaryScrollEvent { event ->
                                scope.launch { list.scrollBy(event.verticalScrollPixels) }; true
                            }
                    ) {
                        item { Text(stringResource(when { consenting -> R.string.cloud_consent_title; reporting -> R.string.report_action; else -> R.string.settings_title }), fontSize = 18.sp, textAlign = TextAlign.Center) }
                        notice?.let { message -> item { Text(message, fontSize = 12.sp, textAlign = TextAlign.Center) } }
                        if (consenting) {
                            item { Text("Adults 18+ · Optional cloud AI", fontSize = 16.sp, textAlign = TextAlign.Center) }
                            item { Text("Enabling uploads existing completed recordings and future recordings, including audio and saved location, to Supabase. Audio and recording time go to Google Gemini for transcription and organization. Location and internal IDs are excluded from Gemini metadata. Avoid sensitive recordings. AI results can be wrong.", fontSize = 12.sp, textAlign = TextAlign.Center) }
                            item { Text("Turning off stops future sync and queues server consent withdrawal when online. Cloud copies stay until deleted in the portal. Requests already sent may finish. Local recording remains available without cloud consent.", fontSize = 12.sp, textAlign = TextAlign.Center) }
                            item { Text("Privacy: haptilog.keepory.app/privacy.html", fontSize = 12.sp, textAlign = TextAlign.Center) }
                            item { FlexibleChip(enabled = !busy, label = { Text(maxLines = Int.MAX_VALUE, text = stringResource(if (busy) R.string.connecting_notice else R.string.agree_cloud)) }, onClick = {
                                busy = true
                                scope.launch {
                                    try {
                                        withContext(Dispatchers.IO) { CloudConsent.enable(this@SettingsActivity) }
                                        cloud = true
                                        consenting = false
                                        notice = "Cloud enabled. Existing completed recordings may upload."
                                    } catch (_: Exception) { notice = "Could not enable cloud. Check your connection and retry." }
                                    finally { busy = false }
                                }
                            }) }
                            item { FlexibleChip(enabled = !busy, label = { Text(maxLines = Int.MAX_VALUE, text = stringResource(R.string.decline_cloud)) }, onClick = { consenting = false }) }
                        } else if (reporting) {
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
                                        if (description.isEmpty()) Text(stringResource(R.string.describe_issue), fontSize = 14.sp, color = Color.LightGray)
                                        field()
                                    }
                                )
                            }
                            item { Text("Includes app build, watch model and Android version. No recordings or location. Avoid private details.", fontSize = 12.sp, textAlign = TextAlign.Center) }
                            item {
                                FlexibleChip(enabled = !busy && description.isNotBlank() && CloudClient.configured,
                                    label = { Text(maxLines = Int.MAX_VALUE, text = stringResource(if (busy) R.string.saving_notice else R.string.send_report_action)) },
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
                            item { FlexibleChip(enabled = !busy, onClick = { reporting = false; notice = null }, label = { Text(maxLines = Int.MAX_VALUE, text = stringResource(R.string.cancel_action)) }) }
                        } else {
                            item { SettingsSection(stringResource(R.string.connection_group)) }
                            item {
                                ToggleChip(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 52.dp),
                                    checked = cloud, enabled = CloudClient.configured && !busy,
                                    onCheckedChange = { enabled ->
                                        if (enabled) consenting = true else {
                                            CloudConsent.disable(this@SettingsActivity)
                                            cloud = false
                                            notice = "Sync stopped. Server withdrawal will be sent when online. Cloud copies remain until deleted."
                                        }
                                    }, label = { Text(stringResource(R.string.cloud_sync_title), maxLines = Int.MAX_VALUE) },
                                    colors = ToggleChipDefaults.toggleChipColors(
                                        checkedStartBackgroundColor = Color(0xFF142A38),
                                        checkedEndBackgroundColor = Color(0xFF142A38),
                                        checkedContentColor = WatchColors.Text,
                                        uncheckedStartBackgroundColor = WatchColors.Surface,
                                        uncheckedEndBackgroundColor = WatchColors.Surface),
                                    toggleControl = { Switch(checked = cloud) })
                            }
                            if (!cloud) item { Text(stringResource(R.string.cloud_off_notice), fontSize = 12.sp,
                                color = WatchColors.Muted, modifier = Modifier.fillMaxWidth()) }
                            item {
                                FlexibleChip(enabled = CloudClient.configured, onClick = {
                                    startActivity(Intent(this@SettingsActivity, WebAccessActivity::class.java))
                                }, label = { Text(stringResource(R.string.web_access_title), maxLines = Int.MAX_VALUE) },
                                    secondaryLabel = { Text(stringResource(R.string.web_access_hint), maxLines = Int.MAX_VALUE) },
                                    icon = { Icon(painterResource(R.drawable.ic_link), null, Modifier.size(22.dp), tint = Color(0xFFA8D8FF)) })
                            }
                            item { SettingsSection(stringResource(R.string.haptics_group)) }
                            item {
                                FlexibleChip(onClick = {
                                    val next = hapticIntensity.next()
                                    HapticPreferences.setIntensity(this@SettingsActivity, next)
                                    hapticIntensity = next
                                    hapticManager.playPreviewPulse(next)
                                }, label = { Text(stringResource(R.string.haptic_intensity_title), maxLines = Int.MAX_VALUE) },
                                    secondaryLabel = { Text(stringResource(hapticIntensity.labelRes), maxLines = Int.MAX_VALUE) })
                            }
                            item { FlexibleChip(onClick = {
                                startActivity(Intent(this@SettingsActivity, LocationJournalActivity::class.java))
                            }, label = { Text(stringResource(R.string.location_journal_title), maxLines = Int.MAX_VALUE) },
                                secondaryLabel = { Text(stringResource(R.string.location_journal_hint), maxLines = Int.MAX_VALUE) }) }
                            item { FlexibleChip(onClick = {
                                startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                    .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName))
                            }, label = { Text(stringResource(R.string.notification_settings), maxLines = Int.MAX_VALUE) },
                                secondaryLabel = { Text(stringResource(R.string.notification_settings_hint), maxLines = Int.MAX_VALUE) }) }
                            item { SettingsSection(stringResource(R.string.help_group)) }
                            item { FlexibleChip(onClick = {
                                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://haptilog.keepory.app/privacy.html"))) }
                                catch (_: ActivityNotFoundException) { notice = "Privacy policy: https://haptilog.keepory.app/privacy.html" }
                            }, label = { Text(stringResource(R.string.privacy_action), maxLines = Int.MAX_VALUE) }) }
                            item { FlexibleChip(onClick = { reporting = true; notice = null },
                                label = { Text(stringResource(R.string.report_action), maxLines = Int.MAX_VALUE) }) }
                            item {
                                ToggleChip(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 52.dp),
                                    checked = crashes, onCheckedChange = { enabled ->
                                        AppReports.setCrashReportsEnabled(this@SettingsActivity, enabled)
                                        crashes = enabled
                                        queued = AppReports.pending(this@SettingsActivity)
                                    }, label = { Text(stringResource(R.string.crash_reports_title), maxLines = Int.MAX_VALUE) },
                                    toggleControl = { Switch(checked = crashes) })
                            }
                            item { Text("Optional. Sends app crash types and code locations after restart. No recordings, location, credentials or exception messages. Turning off stops future reports and removes queued crashes.", fontSize = 12.sp, textAlign = TextAlign.Center) }
                            if (queued > 0) item {
                                FlexibleChip(onClick = {
                                    queued = AppReports.pending(this@SettingsActivity)
                                    ReportUploadWorker.schedule(this@SettingsActivity)
                                    notice = if (queued == 0) "All queued reports sent." else "$queued queued. Will retry online."
                                }, label = { Text("Retry reports ($queued)", maxLines = Int.MAX_VALUE) })
                            }
                            item { SettingsSection(stringResource(R.string.about_group)) }
                            item { FlexibleChip(onClick = {
                                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName"))) }
                                catch (_: ActivityNotFoundException) { notice = "Play Store unavailable on this watch." }
                            }, label = { Text(stringResource(R.string.store_action), maxLines = Int.MAX_VALUE) }) }
                            item { Text(stringResource(R.string.build_info, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE),
                                fontSize = 12.sp, color = WatchColors.Muted) }
                        }
                        if (!CloudClient.configured) item { Text("Reporting needs cloud configuration.", fontSize = 12.sp, textAlign = TextAlign.Center) }
                        item { Spacer(Modifier.height(24.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsSection(title: String) {
    Text(title, fontSize = 12.sp, color = WatchColors.Muted,
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 2.dp))
}
