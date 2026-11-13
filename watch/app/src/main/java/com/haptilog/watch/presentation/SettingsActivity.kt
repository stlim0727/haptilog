package com.haptilog.watch.presentation

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.*
import com.haptilog.watch.BuildConfig
import com.haptilog.watch.R
import com.haptilog.watch.data.HapticIntensity
import com.haptilog.watch.data.HapticPreferences
import com.haptilog.watch.data.location.LocationCollection
import com.haptilog.watch.service.HapticHeartbeatManager
import com.haptilog.watch.sync.CloudClient
import com.haptilog.watch.sync.CloudConsent
import com.haptilog.watch.sync.RecordingSyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal enum class SettingsPage { HUB, HAPTICS, CONNECTION }

/** Four navigation entries; settings change only inside their detail page. */
class SettingsActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            HaptiLogTheme {
                AppScaffold {
                    val scope = rememberCoroutineScope()
                    val list = rememberScalingLazyListState(initialCenterItemIndex = 0)
                    val focus = remember { FocusRequester() }

                    var collectionScope by remember { mutableStateOf(LocationCollection.load(this@SettingsActivity)) }
                    var cloud by remember { mutableStateOf(RecordingSyncWorker.enabled(this@SettingsActivity)) }
                    var deferredSync by remember {
                        mutableStateOf(getSharedPreferences("cloud_options", MODE_PRIVATE).getBoolean("deferred_sync", false))
                    }
                    var hapticIntensity by remember { mutableStateOf(HapticPreferences.getIntensity(this@SettingsActivity)) }
                    val hapticManager = remember { HapticHeartbeatManager(this@SettingsActivity) }

                    var page by rememberSaveable { mutableStateOf(SettingsPage.HUB) }
                    var consenting by rememberSaveable { mutableStateOf(false) }
                    var busy by remember { mutableStateOf(false) }
                    var notice by remember { mutableStateOf<String?>(null) }

                    DisposableEffect(Unit) {
                        val observer = LifecycleEventObserver { _, event ->
                            if (event == Lifecycle.Event.ON_RESUME) {
                                cloud = RecordingSyncWorker.enabled(this@SettingsActivity)
                                collectionScope = LocationCollection.load(this@SettingsActivity)
                                deferredSync = getSharedPreferences("cloud_options", MODE_PRIVATE).getBoolean("deferred_sync", false)
                                hapticIntensity = HapticPreferences.getIntensity(this@SettingsActivity)
                            }
                        }
                        lifecycle.addObserver(observer)
                        onDispose { lifecycle.removeObserver(observer) }
                    }

                    BackHandler(enabled = (consenting || page != SettingsPage.HUB) && !busy) {
                        if (consenting) consenting = false else page = SettingsPage.HUB
                        notice = null
                    }
                    LaunchedEffect(page, consenting) {
                        list.scrollToItem(0)
                        focus.requestFocus()
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
                                    stringResource(when {
                                        consenting -> R.string.cloud_consent_title
                                        page == SettingsPage.HAPTICS -> R.string.settings_haptics_title
                                        page == SettingsPage.CONNECTION -> R.string.settings_connection_title
                                        else -> R.string.settings_title
                                    }),
                                    fontSize = 16.sp,
                                    textAlign = TextAlign.Center
                                )
                            }
                            notice?.let { message ->
                                item {
                                    Text(
                                        message,
                                        fontSize = 12.sp,
                                        color = WatchColors.Muted,
                                        textAlign = TextAlign.Center,
                                        modifier = Modifier.padding(horizontal = 8.dp)
                                    )
                                }
                            }

                            if (consenting) {
                                item {
                                    Text(
                                        stringResource(R.string.cloud_consent_dialog_msg),
                                        fontSize = 12.sp,
                                        textAlign = TextAlign.Center,
                                        modifier = Modifier.padding(horizontal = 8.dp)
                                    )
                                }
                                item {
                                    SettingAction(
                                        enabled = !busy,
                                        onClick = {
                                            busy = true
                                            scope.launch {
                                                try {
                                                    withContext(Dispatchers.IO) { CloudConsent.enable(this@SettingsActivity) }
                                                    cloud = true
                                                    consenting = false
                                                    notice = getString(R.string.unified_cloud_enabled)
                                                } catch (_: Exception) {
                                                    notice = getString(R.string.cloud_enable_failed)
                                                } finally {
                                                    busy = false
                                                }
                                            }
                                        },
                                        label = stringResource(if (busy) R.string.connecting_notice else R.string.cloud_consent_agree)
                                    )
                                }
                                item {
                                    SettingAction(
                                        enabled = !busy,
                                        onClick = { consenting = false },
                                        label = stringResource(R.string.cancel_action)
                                    )
                                }
                            } else if (page == SettingsPage.HUB) {
                                item {
                                    SettingAction(
                                        onClick = { page = SettingsPage.HAPTICS; notice = null },
                                        label = stringResource(R.string.settings_haptics_title),
                                        secondaryLabel = stringResource(hapticIntensity.labelRes),
                                        modifier = Modifier.testTag("settings-haptics")
                                    )
                                }
                                item {
                                    SettingAction(
                                        onClick = { startActivity(Intent(this@SettingsActivity, LocationSettingsActivity::class.java)) },
                                        label = stringResource(R.string.location_scope_title),
                                        secondaryLabel = stringResource(collectionScope.label)
                                    )
                                }
                                item {
                                    SettingAction(
                                        onClick = { page = SettingsPage.CONNECTION; notice = null },
                                        label = stringResource(R.string.settings_connection_title),
                                        secondaryLabel = stringResource(when {
                                            !CloudClient.configured -> R.string.settings_cloud_unavailable
                                            cloud -> R.string.settings_cloud_on
                                            else -> R.string.settings_cloud_off
                                        }),
                                        modifier = Modifier.testTag("settings-connection")
                                    )
                                }
                                item {
                                    SettingAction(
                                        onClick = { startActivity(Intent(this@SettingsActivity, SupportActivity::class.java)) },
                                        label = stringResource(R.string.settings_support_title),
                                        secondaryLabel = stringResource(R.string.support_hint, BuildConfig.VERSION_NAME)
                                    )
                                }
                            } else if (page == SettingsPage.HAPTICS) {
                                item { Text(stringResource(R.string.haptic_intensity_hint), fontSize = 12.sp) }
                                HapticIntensity.entries.forEach { intensity ->
                                    item {
                                        SettingAction(
                                            onClick = {
                                                HapticPreferences.setIntensity(this@SettingsActivity, intensity)
                                                hapticIntensity = intensity
                                                hapticManager.playPreviewPulse(intensity)
                                            },
                                            label = stringResource(intensity.labelRes),
                                            modifier = Modifier.testTag("haptic-${intensity.id}").semantics {
                                                selected = hapticIntensity == intensity
                                                role = Role.RadioButton
                                            }
                                        )
                                    }
                                }
                                item {
                                    SettingAction(
                                        onClick = { hapticManager.playPreviewPulse(hapticIntensity) },
                                        label = stringResource(R.string.settings_haptic_preview)
                                    )
                                }
                                item {
                                    SettingAction(
                                        onClick = {
                                            startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                                .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName))
                                        },
                                        label = stringResource(R.string.notification_settings),
                                        secondaryLabel = stringResource(R.string.notification_settings_hint)
                                    )
                                }
                            } else {
                                // 3. Cloud Sync Toggle
                                item {
                                    SwitchButton(
                                        checked = cloud,
                                        enabled = CloudClient.configured && !busy,
                                        onCheckedChange = { enabled ->
                                            if (enabled) {
                                                consenting = true
                                                notice = null
                                            } else {
                                                CloudConsent.disable(this@SettingsActivity)
                                                cloud = false
                                                notice = getString(R.string.settings_cloud_disabled)
                                            }
                                        },
                                        label = {
                                            Text(
                                                stringResource(R.string.cloud_sync_title),
                                                maxLines = Int.MAX_VALUE
                                            )
                                        },
                                        secondaryLabel = {
                                            Text(
                                                stringResource(R.string.cloud_sync_summary),
                                                maxLines = Int.MAX_VALUE
                                            )
                                        },
                                        modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 52.dp)
                                    )
                                }

                                // 4. Deferred Sync Toggle (Battery saver, when cloud is on)
                                if (cloud) {
                                    item {
                                        SwitchButton(
                                            checked = deferredSync,
                                            enabled = CloudClient.configured && !busy,
                                            onCheckedChange = { enabled ->
                                                getSharedPreferences("cloud_options", MODE_PRIVATE)
                                                    .edit()
                                                    .putBoolean("deferred_sync", enabled)
                                                    .apply()
                                                deferredSync = enabled
                                                RecordingSyncWorker.schedule(this@SettingsActivity)
                                                com.haptilog.watch.sync.RawLocationSyncWorker.schedule(this@SettingsActivity)
                                            },
                                            label = {
                                                Text(
                                                    stringResource(R.string.cloud_sync_deferred_title),
                                                    maxLines = Int.MAX_VALUE
                                                )
                                            },
                                            secondaryLabel = {
                                                Text(
                                                    stringResource(R.string.cloud_sync_deferred_summary),
                                                    maxLines = Int.MAX_VALUE
                                                )
                                            },
                                            modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 52.dp)
                                        )
                                    }
                                }

                                item {
                                    SettingAction(
                                        enabled = CloudClient.configured,
                                        onClick = { startActivity(Intent(this@SettingsActivity, WebAccessActivity::class.java)) },
                                        label = stringResource(R.string.web_access_title),
                                        secondaryLabel = stringResource(R.string.web_access_hint)
                                    )
                                }
                                if (!CloudClient.configured) item {
                                    Text(stringResource(R.string.settings_cloud_unavailable), fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
