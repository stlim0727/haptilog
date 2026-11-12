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
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.res.painterResource
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
import com.haptilog.watch.data.HapticPreferences
import com.haptilog.watch.data.location.LocationCollection
import com.haptilog.watch.service.HapticHeartbeatManager
import com.haptilog.watch.sync.CloudClient
import com.haptilog.watch.sync.CloudConsent
import com.haptilog.watch.sync.RecordingSyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Clean, glanceable Wear OS settings hub. */
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

                    BackHandler(enabled = consenting && !busy) {
                        consenting = false
                        notice = null
                    }
                    LaunchedEffect(consenting) {
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
                                    stringResource(if (consenting) R.string.cloud_consent_title else R.string.settings_title),
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
                            } else {
                                // 1. Haptic Intensity
                                item {
                                    SettingAction(
                                        onClick = {
                                            val next = hapticIntensity.next()
                                            HapticPreferences.setIntensity(this@SettingsActivity, next)
                                            hapticIntensity = next
                                            hapticManager.playPreviewPulse(next)
                                        },
                                        label = stringResource(R.string.haptic_intensity_title),
                                        secondaryLabel = stringResource(hapticIntensity.labelRes)
                                    )
                                }

                                // 2. Location Scope
                                item {
                                    SettingAction(
                                        onClick = {
                                            startActivity(Intent(this@SettingsActivity, LocationSettingsActivity::class.java))
                                        },
                                        label = stringResource(R.string.location_scope_title),
                                        secondaryLabel = stringResource(collectionScope.label)
                                    )
                                }

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
                                                notice = "Sync stopped. Cloud copies remain until deleted."
                                            }
                                        },
                                        label = {
                                            Text(
                                                stringResource(R.string.cloud_sync_title),
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        },
                                        secondaryLabel = {
                                            Text(
                                                stringResource(R.string.cloud_sync_summary),
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
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
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            },
                                            secondaryLabel = {
                                                Text(
                                                    stringResource(R.string.cloud_sync_deferred_summary),
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            },
                                            modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 52.dp)
                                        )
                                    }
                                }

                                // 5. Web Access
                                item {
                                    SettingAction(
                                        enabled = CloudClient.configured,
                                        onClick = {
                                            startActivity(Intent(this@SettingsActivity, WebAccessActivity::class.java))
                                        },
                                        label = stringResource(R.string.web_access_title),
                                        secondaryLabel = stringResource(R.string.web_access_hint),
                                        icon = {
                                            Icon(
                                                painter = painterResource(R.drawable.ic_link),
                                                contentDescription = null,
                                                tint = Color(0xFFA8D8FF),
                                                modifier = Modifier.size(20.dp).padding(end = 6.dp)
                                            )
                                        }
                                    )
                                }

                                // 6. System Notifications
                                item {
                                    SettingAction(
                                        onClick = {
                                            startActivity(
                                                Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                                    .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName)
                                            )
                                        },
                                        label = stringResource(R.string.notification_settings),
                                        secondaryLabel = stringResource(R.string.notification_settings_hint)
                                    )
                                }

                                // 7. About & Support
                                item {
                                    SettingAction(
                                        onClick = {
                                            startActivity(Intent(this@SettingsActivity, SupportActivity::class.java))
                                        },
                                        label = stringResource(R.string.support_title),
                                        secondaryLabel = stringResource(R.string.support_hint, BuildConfig.VERSION_NAME)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
