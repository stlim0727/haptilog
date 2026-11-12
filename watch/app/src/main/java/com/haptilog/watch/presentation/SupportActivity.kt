package com.haptilog.watch.presentation

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.*
import com.haptilog.watch.BuildConfig
import com.haptilog.watch.R
import com.haptilog.watch.support.AppReports
import com.haptilog.watch.support.ReportUploadWorker
import com.haptilog.watch.sync.CloudClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Consolidated diagnostics, stability controls, privacy and app version. */
class SupportActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            HaptiLogTheme {
                AppScaffold {
                    val scope = rememberCoroutineScope()
                    val list = rememberScalingLazyListState(initialCenterItemIndex = 0)
                    val focus = remember { FocusRequester() }
                    var crashes by remember { mutableStateOf(AppReports.crashReportsEnabled(this@SupportActivity)) }
                    var queued by remember { mutableStateOf(AppReports.pending(this@SupportActivity)) }
                    var notice by remember { mutableStateOf<String?>(null) }
                    var busy by remember { mutableStateOf(false) }

                    DisposableEffect(Unit) {
                        val observer = LifecycleEventObserver { _, event ->
                            if (event == Lifecycle.Event.ON_RESUME) {
                                queued = AppReports.pending(this@SupportActivity)
                            }
                        }
                        lifecycle.addObserver(observer)
                        onDispose { lifecycle.removeObserver(observer) }
                    }

                    ScreenScaffold(scrollState = list) {
                        ScalingLazyColumn(
                            state = list,
                            autoCentering = null,
                            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 36.dp, bottom = 48.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier
                                .fillMaxSize()
                                .focusRequester(focus)
                                .focusable()
                                .onRotaryScrollEvent { event ->
                                    scope.launch { list.scrollBy(event.verticalScrollPixels) }
                                    true
                                }
                        ) {
                            item {
                                Text(
                                    stringResource(R.string.support_title),
                                    fontSize = 16.sp,
                                    textAlign = TextAlign.Center
                                )
                            }
                            item {
                                Text(
                                    stringResource(R.string.build_info, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE),
                                    fontSize = 12.sp,
                                    color = WatchColors.Muted,
                                    textAlign = TextAlign.Center
                                )
                            }
                            item {
                                SwitchButton(
                                    checked = crashes,
                                    onCheckedChange = { enabled ->
                                        AppReports.setCrashReportsEnabled(this@SupportActivity, enabled)
                                        crashes = enabled
                                        queued = AppReports.pending(this@SupportActivity)
                                    },
                                    label = {
                                        Text(
                                            stringResource(R.string.crash_reports_title),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    },
                                    secondaryLabel = {
                                        Text(
                                            stringResource(R.string.crash_reports_hint),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    },
                                    modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 52.dp)
                                )
                            }
                            item {
                                SettingAction(
                                    onClick = {
                                        if (busy) return@SettingAction
                                        busy = true
                                        scope.launch {
                                            try {
                                                val id = withContext(Dispatchers.IO) {
                                                    AppReports.save(
                                                        this@SupportActivity,
                                                        "issue",
                                                        "Diagnostic snapshot: model=${Build.MODEL}, sdk=${Build.VERSION.SDK_INT}, app=${BuildConfig.VERSION_NAME}"
                                                    )
                                                }
                                                if (id != null) {
                                                    ReportUploadWorker.schedule(this@SupportActivity)
                                                    notice = getString(R.string.support_diagnostics_sent)
                                                } else {
                                                    notice = getString(R.string.support_diagnostics_failed)
                                                }
                                                queued = AppReports.pending(this@SupportActivity)
                                            } catch (_: Exception) {
                                                notice = getString(R.string.support_diagnostics_failed)
                                            } finally {
                                                busy = false
                                            }
                                        }
                                    },
                                    label = stringResource(R.string.support_diagnostics_action),
                                    secondaryLabel = stringResource(R.string.support_diagnostics_hint),
                                    enabled = !busy && CloudClient.configured
                                )
                            }
                            if (queued > 0) {
                                item {
                                    SettingAction(
                                        onClick = {
                                            queued = AppReports.pending(this@SupportActivity)
                                            ReportUploadWorker.schedule(this@SupportActivity)
                                            notice = if (queued == 0) "All reports sent." else "$queued queued. Will retry online."
                                        },
                                        label = stringResource(R.string.support_retry_reports, queued)
                                    )
                                }
                            }
                            notice?.let { msg ->
                                item {
                                    Text(
                                        msg,
                                        fontSize = 12.sp,
                                        color = WatchColors.Muted,
                                        textAlign = TextAlign.Center,
                                        modifier = Modifier.padding(horizontal = 8.dp)
                                    )
                                }
                            }
                            item {
                                SettingAction(
                                    onClick = {
                                        try {
                                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://haptilog.keepory.app/privacy.html")))
                                        } catch (_: ActivityNotFoundException) {
                                            notice = "Privacy: https://haptilog.keepory.app/privacy.html"
                                        }
                                    },
                                    label = stringResource(R.string.privacy_action)
                                )
                            }
                            item {
                                SettingAction(
                                    onClick = {
                                        try {
                                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName")))
                                        } catch (_: ActivityNotFoundException) {
                                            notice = "Play Store unavailable on this watch."
                                        }
                                    },
                                    label = stringResource(R.string.store_action)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
