package com.haptilog.watch.presentation

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.Role
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.*
import com.haptilog.watch.R
import com.haptilog.watch.data.location.LocationCollection
import com.haptilog.watch.service.LocationTrackingService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** One scope choice, separate from actual service state and cloud consent. */
class LocationSettingsActivity : ComponentActivity() {
    private var selection by mutableStateOf(LocationCollection.RECORDING_ONLY)
    private var notice by mutableStateOf<String?>(null)
    private var pendingScope: LocationCollection? = null
    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        val desired = pendingScope
        pendingScope = null
        if (desired != null) {
            if (hasLocation() && (desired != LocationCollection.INCLUDING_NON_RECORDING || hasNotifications())) {
                applyScope(desired)
            } else notice = getString(R.string.location_permission_needed)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingScope = savedInstanceState?.getString("pending_scope")?.let { value ->
            LocationCollection.entries.firstOrNull { it.name == value }
        }
        selection = LocationCollection.load(this)
        setContent {
            HaptiLogTheme { AppScaffold {
                val list = rememberScalingLazyListState(initialCenterItemIndex = 0)
                val active by LocationTrackingService.isTracking.collectAsState()
                val serviceNotice by LocationTrackingService.status.collectAsState()
                var rawConsenting by rememberSaveable { mutableStateOf(false) }
                var rawAccepted by remember { mutableStateOf(com.haptilog.watch.sync.RawLocationConsent.grant(this@LocationSettingsActivity) != null) }
                var cloudActive by remember { mutableStateOf(com.haptilog.watch.sync.RecordingSyncWorker.enabled(this@LocationSettingsActivity)) }
                DisposableEffect(Unit) {
                    val observer = LifecycleEventObserver { _, event ->
                        if (event == Lifecycle.Event.ON_RESUME) {
                            cloudActive = com.haptilog.watch.sync.RecordingSyncWorker.enabled(this@LocationSettingsActivity)
                            rawAccepted = com.haptilog.watch.sync.RawLocationConsent.grant(this@LocationSettingsActivity) != null
                        }
                    }
                    lifecycle.addObserver(observer)
                    onDispose { lifecycle.removeObserver(observer) }
                }
                val rawDisclosure = stringArrayResource(R.array.raw_location_disclosure_steps)

                BackHandler(enabled = rawConsenting) { rawConsenting = false }
                LaunchedEffect(rawConsenting) { list.scrollToItem(0) }

                ScreenScaffold(scrollState = list) {
                    ScalingLazyColumn(state = list, autoCentering = null,
                        contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 38.dp, bottom = 48.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
                        if (rawConsenting) {
                            item { Text(stringResource(R.string.raw_location_title), textAlign = TextAlign.Center) }
                            item { Text(stringResource(if (rawAccepted) R.string.raw_location_status_approved else R.string.raw_location_status_needed), textAlign = TextAlign.Center) }
                            item { Text(stringResource(when {
                                !com.haptilog.watch.sync.CloudClient.configured -> R.string.settings_cloud_unavailable
                                !cloudActive -> R.string.raw_location_cloud_off
                                !rawAccepted -> R.string.raw_location_status_needed
                                else -> R.string.raw_location_transfer_allowed
                            }), fontSize = 12.sp, textAlign = TextAlign.Center) }
                            item { Text(stringResource(if (active) R.string.location_running else R.string.location_scope_interrupted), fontSize = 12.sp, textAlign = TextAlign.Center) }
                            rawDisclosure.forEach { paragraph ->
                                item { Text(paragraph, fontSize = 12.sp, textAlign = TextAlign.Center) }
                            }
                            if (!rawAccepted) item {
                                SettingAction(
                                    enabled = cloudActive && com.haptilog.watch.sync.CloudClient.configured,
                                    onClick = {
                                        rawConsenting = false
                                        lifecycleScope.launch {
                                            try {
                                                withContext(Dispatchers.IO) {
                                                    com.haptilog.watch.sync.RawLocationConsent.enable(this@LocationSettingsActivity)
                                                }
                                                rawAccepted = true
                                                notice = getString(R.string.raw_location_accepted)
                                            } catch (_: Exception) {
                                                notice = getString(R.string.raw_location_unavailable)
                                            }
                                        }
                                    },
                                    label = stringResource(R.string.raw_location_agree)
                                )
                            }
                            item {
                                SettingAction(
                                    onClick = { rawConsenting = false },
                                    label = stringResource(R.string.settings_back_action)
                                )
                            }
                        } else {
                            item { Text(stringResource(R.string.location_scope_title), textAlign = TextAlign.Center) }
                            LocationCollection.entries.forEach { option -> item {
                                DetailAction(modifier = Modifier.semantics { selected = selection == option; role = Role.RadioButton }, onClick = { choose(option) }, label = {
                                    Text((if (selection == option) "✓ " else "") + stringResource(option.label))
                                })
                            } }
                            if (selection == LocationCollection.INCLUDING_NON_RECORDING) {
                                item { Text(stringResource(if (active) R.string.location_running else R.string.location_scope_interrupted), textAlign = TextAlign.Center) }
                                item {
                                    SettingAction(
                                        onClick = {
                                            rawConsenting = true
                                        },
                                        label = stringResource(R.string.raw_location_title),
                                        secondaryLabel = stringResource(if (rawAccepted) R.string.raw_location_status_approved else R.string.raw_location_status_needed)
                                    )
                                }
                            }
                            listOf(R.string.location_scope_disclosure, R.string.location_scope_microphone,
                                R.string.location_scope_lifecycle).forEach { text -> item {
                                Text(stringResource(text), fontSize = 13.sp, textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(horizontal = 12.dp))
                            } }
                            (notice ?: serviceNotice)?.let { message -> item { Text(message, textAlign = TextAlign.Center) } }
                            item { DetailAction(onClick = {
                                startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                    android.net.Uri.parse("package:$packageName")))
                            }, label = { Text(stringResource(R.string.location_open_settings)) }) }
                        }
                    }
                }
            } }
        }
    }

    override fun onResume() {
        super.onResume()
        selection = LocationCollection.load(this)
        LocationTrackingService.ensureAlwaysSession(this)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("pending_scope", pendingScope?.name)
        super.onSaveInstanceState(outState)
    }

    private fun hasLocation() = ContextCompat.checkSelfPermission(this,
        Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    private fun hasNotifications() = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this,
        Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun choose(scope: LocationCollection) {
        notice = null
        if (scope == LocationCollection.OFF ||
            ((scope == LocationCollection.RECORDING_ONLY || scope == LocationCollection.PASSIVE) && selection == LocationCollection.INCLUDING_NON_RECORDING) || (hasLocation() &&
                (scope != LocationCollection.INCLUDING_NON_RECORDING || hasNotifications()))) {
            applyScope(scope)
        } else {
            pendingScope = scope
            val requested = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            if (scope == LocationCollection.INCLUDING_NON_RECORDING && Build.VERSION.SDK_INT >= 33) {
                requested += Manifest.permission.POST_NOTIFICATIONS
            }
            permissions.launch(requested.toTypedArray())
        }
    }

    private fun applyScope(scope: LocationCollection) {
        try {
            LocationCollection.save(this, scope)
            selection = scope
            if (scope == LocationCollection.INCLUDING_NON_RECORDING) {
                LocationTrackingService.ensureAlwaysSession(this)
            } else if (LocationTrackingService.isTracking.value) {
                startService(Intent(this, LocationTrackingService::class.java).setAction(LocationTrackingService.ACTION_STOP))
            }
        } catch (_: RuntimeException) {
            notice = getString(R.string.location_start_failed)
        }
    }
}
