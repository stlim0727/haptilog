package com.haptilog.watch.presentation

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.*
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.haptilog.watch.R
import com.haptilog.watch.data.location.*
import com.haptilog.watch.sync.LocationConsent
import com.haptilog.watch.sync.CloudClient
import com.haptilog.watch.service.LocationTrackingService
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/** A separate, explicitly started journal. It never changes audio or cloud consent. */
class LocationJournalActivity : ComponentActivity() {
    private var notice by mutableStateOf<String?>(null)
    private var busy by mutableStateOf(false)
    private var latitude by mutableStateOf("")
    private var longitude by mutableStateOf("")
    private var pendingAction: String? = null
    private var cloudManaged by mutableStateOf(false)

    override fun onResume() {
        super.onResume()
        cloudManaged = LocationConsent.enabled(this)
        // The journal is reachable from Settings without passing the main screen, so it
        // re-affirms the Always scope itself rather than showing a stopped state.
        LocationTrackingService.ensureAlwaysSession(this)
    }

    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        pendingAction = null
        if (hasFineLocation()) locate() else notice = getString(R.string.location_permission_needed)
    }

    private fun hasFineLocation() = ContextCompat.checkSelfPermission(this,
        Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun requestLocation(action: String) {
        notice = null
        if (hasFineLocation()) locate() else {
            pendingAction = action
            permissions.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }

    @SuppressLint("MissingPermission")
    private fun locate() {
        if (!(getSystemService(LOCATION_SERVICE) as LocationManager).isLocationEnabled) {
            notice = getString(R.string.location_enable_gps)
            return
        }
        busy = true
        lifecycleScope.launch {
            val cancellation = CancellationTokenSource()
            try {
                val fix = withTimeoutOrNull(20_000) {
                    LocationServices.getFusedLocationProviderClient(this@LocationJournalActivity)
                        .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellation.token).await()
                }
                val age = fix?.let { SystemClock.elapsedRealtimeNanos() - it.elapsedRealtimeNanos }
                if (fix != null && age != null && age in 0..120_000_000_000L && fix.hasAccuracy() &&
                    fix.accuracy.isFinite() && fix.accuracy in 0f..100f) {
                    latitude = fix.latitude.toString()
                    longitude = fix.longitude.toString()
                    notice = getString(R.string.location_center_ready)
                } else notice = getString(R.string.location_no_fix)
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { notice = getString(R.string.location_no_fix) }
            finally { cancellation.cancel(); busy = false }
        }
    }

    private fun change(onSuccess: () -> Unit = {}, action: () -> Unit) {
        busy = true
        lifecycleScope.launch {
            try { withContext(Dispatchers.IO) { action() }; notice = null; onSuccess() }
            catch (e: CancellationException) { throw e }
            catch (_: Exception) { notice = getString(R.string.location_save_failed) }
            finally { busy = false }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("location_action", pendingAction)
        outState.putString("latitude", latitude)
        outState.putString("longitude", longitude)
        super.onSaveInstanceState(outState)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingAction = savedInstanceState?.getString("location_action")
        latitude = savedInstanceState?.getString("latitude").orEmpty()
        longitude = savedInstanceState?.getString("longitude").orEmpty()
        lifecycleScope.launch {
            val repository = try { withContext(Dispatchers.IO) { LocationHistoryRepository.get(this@LocationJournalActivity) } }
            catch (e: CancellationException) { throw e }
            catch (_: Exception) {
                setContent { HaptiLogTheme { Text(stringResource(R.string.location_save_failed), modifier = Modifier.padding(32.dp)) } }
                return@launch
            }
            setContent {
                HaptiLogTheme { AppScaffold {
                    val history by repository.state.collectAsState()
                    var advanced by rememberSaveable { mutableStateOf(false) }
                    LaunchedEffect(Unit) {
                        while (true) {
                            cloudManaged = LocationConsent.enabled(this@LocationJournalActivity)
                            kotlinx.coroutines.delay(2_000)
                        }
                    }
                    var displayNow by remember { mutableLongStateOf(System.currentTimeMillis()) }
                    LaunchedEffect(Unit) {
                        while (true) { kotlinx.coroutines.delay(30_000); displayNow = System.currentTimeMillis() }
                    }
                    val active by LocationTrackingService.isTracking.collectAsState()
                    val serviceNotice by LocationTrackingService.status.collectAsState()
                    var page by rememberSaveable { mutableStateOf("home") }
                    var name by rememberSaveable { mutableStateOf("") }
                    var editId by rememberSaveable { mutableStateOf<String?>(null) }
                    var radius by rememberSaveable { mutableIntStateOf(200) }
                    var limit by rememberSaveable { mutableIntStateOf(30) }
                    val list = rememberScalingLazyListState(initialCenterItemIndex = 0)
                    BackHandler(page != "home" && !busy) { page = "home"; notice = null }
                    LaunchedEffect(page) { list.scrollToItem(0) }
                    ScreenScaffold(scrollState = list) {
                        ScalingLazyColumn(state = list, autoCentering = null,
                            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 38.dp, bottom = 48.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
                            item { Text(stringResource(R.string.location_journal_title), textAlign = TextAlign.Center) }
                            if (page != "home") (notice ?: serviceNotice)?.let { item { JournalText(it) } }
                            if (page == "place") {
                                item { JournalField(stringResource(R.string.location_place_name), name, !busy && !cloudManaged) { name = it.take(40) } }
                                item { JournalAction(R.string.location_use_current, !busy && !active && !cloudManaged) { requestLocation("locate") } }
                                item { JournalField(stringResource(R.string.location_latitude), latitude, !busy && !cloudManaged) { latitude = it } }
                                item { JournalField(stringResource(R.string.location_longitude), longitude, !busy && !cloudManaged) { longitude = it } }
                                item { DetailAction(enabled = !busy && !active && !cloudManaged, onClick = {
                                    radius = when (radius) { 150 -> 200; 200 -> 500; 500 -> 1000; 1000 -> 2000; else -> 150 }
                                }, label = { Text(stringResource(R.string.location_radius, radius)) }) }
                                item { JournalAction(R.string.location_save_place, !busy && !active && !cloudManaged && validPlaceInput(name, latitude, longitude)) {
                                    val place = SavedPlace(editId ?: UUID.randomUUID().toString(), name.trim(),
                                        latitude.toDouble(), longitude.toDouble(), radius.toDouble())
                                    change(onSuccess = { page = "home" }) { repository.addPlace(place) }
                                } }
                                editId?.let { id -> item { JournalAction(R.string.location_delete_place, !busy && !active && !cloudManaged) {
                                    change(onSuccess = { page = "home" }) { repository.removePlace(id) }
                                } } }
                                item { JournalAction(R.string.location_back, !busy) { page = "home"; notice = null } }
                            } else if (page == "clear") {
                                item { JournalText(stringResource(R.string.location_clear_confirm)) }
                                item { JournalAction(R.string.location_clear, !busy && !active) {
                                    change(onSuccess = { page = "home" }) { repository.clearHistory() }
                                } }
                                item { JournalAction(R.string.location_back, !busy) { page = "home" } }
                            } else if (page == "events" || page == "points") {
                                if (page == "events") {
                                    if (history.events.isEmpty() && history.stays.isEmpty()) item { JournalText(stringResource(R.string.location_no_events)) }
                                    history.stays.asReversed().take(limit).forEach { stay -> item {
                                        val fresh = stay.status == LocationStayStatus.ACTIVE && active && !stay.clockDiscontinuity &&
                                            displayNow - stay.lastObservedAtMillis in 0..180_000L
                                        val stateLabel = stringResource(if (fresh) R.string.location_stay_observed
                                            else if (stay.status == LocationStayStatus.ACTIVE) R.string.location_stay_stale
                                            else when (stay.endReason) {
                                                LocationStayEndReason.MOVED -> R.string.location_stay_moved
                                                LocationStayEndReason.OBSERVATION_GAP -> R.string.location_stay_gap
                                                LocationStayEndReason.INTERRUPTED, LocationStayEndReason.SERVICE_DESTROYED -> R.string.location_stay_interrupted
                                                else -> R.string.location_stay_closed
                                            })
                                        JournalText("$stateLabel\n" + journalTime(stay.startedAtMillis) + " – " +
                                            journalTime(stay.lastObservedAtMillis) + "\n" +
                                            stringResource(R.string.location_minutes, stay.observedDurationMillis / 60_000))
                                    } }
                                    history.events.asReversed().take(limit).forEach { event -> item {
                                        val label = stringResource(when (event.type) {
                                            LocationEventType.ENTER -> R.string.location_enter
                                            LocationEventType.EXIT -> R.string.location_exit
                                            LocationEventType.DWELL -> R.string.location_dwell
                                        })
                                        JournalText("$label · ${event.placeName ?: stringResource(R.string.location_unsaved_place)}\n" +
                                            journalTime(event.sample.timestampMillis) + "\n" +
                                            String.format(Locale.getDefault(), "%.5f, %.5f", event.sample.latitude, event.sample.longitude) +
                                            (if (event.durationMillis > 0) "\n" + stringResource(R.string.location_minutes, event.durationMillis / 60_000) else ""))
                                    } }
                                } else {
                                    if (history.points.isEmpty()) item { JournalText(stringResource(R.string.location_no_points)) }
                                    history.points.asReversed().take(limit).forEach { point -> item {
                                        JournalText(journalTime(point.timestampMillis) + "\n" +
                                            String.format(Locale.getDefault(), "%.5f, %.5f · ±%.0f m", point.latitude, point.longitude, point.accuracyMeters))
                                    } }
                                }
                                val total = if (page == "events") maxOf(history.events.size, history.stays.size) else history.points.size
                                if (limit < total) item { JournalAction(R.string.location_more) { limit += 30 } }
                                item { JournalAction(R.string.location_back) { page = "home" } }
                            } else {
                                item { FlexibleChip(enabled = !busy, onClick = {
                                    startActivity(Intent(this@LocationJournalActivity, LocationSettingsActivity::class.java))
                                }, label = { Text(stringResource(R.string.location_scope_title), maxLines = Int.MAX_VALUE) },
                                    secondaryLabel = { Text(stringResource(if (active) R.string.location_running else R.string.location_stopped), maxLines = Int.MAX_VALUE) }) }
                                item { FlexibleChip(enabled = !busy, onClick = {
                                    startActivity(Intent(this@LocationJournalActivity, SettingsActivity::class.java))
                                }, label = { Text(stringResource(R.string.cloud_sync_title), maxLines = Int.MAX_VALUE) },
                                    secondaryLabel = { Text(stringResource(if (cloudManaged) R.string.location_sync_on else R.string.location_sync_off), maxLines = Int.MAX_VALUE) }) }
                                (notice ?: serviceNotice)?.let { item { JournalText(it) } }
                                // Recovery is offered only for a reported failure, not for every stopped state.
                                serviceNotice?.let { item { JournalAction(R.string.location_open_settings, !busy) {
                                    startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                        android.net.Uri.parse("package:$packageName")))
                                } } }
                                item { JournalText(stringResource(R.string.location_collection_summary)) }
                                if (cloudManaged && active) item { JournalText(stringResource(R.string.location_sync_next_session)) }
                                item { JournalText(stringResource(R.string.location_counts, history.points.size, history.stays.size)) }
                                (history.latestSample ?: history.points.lastOrNull())?.let { point -> item { JournalText(stringResource(R.string.location_last_fix, journalTime(point.timestampMillis))) } }
                                if (active && history.latestSample == null) item { JournalText(stringResource(R.string.location_waiting_fix)) }
                                item { JournalAction(R.string.location_events) { limit = 30; page = "events" } }
                                item { DetailAction(onClick = { advanced = !advanced },
                                    label = { Text(stringResource(if (advanced) R.string.location_less_settings else R.string.location_more_settings)) }) }
                                if (advanced) {
                                    item { JournalText(stringResource(if (cloudManaged) R.string.location_disclosure_synced else R.string.location_disclosure)) }
                                    item { JournalAction(R.string.location_points) { limit = 30; page = "points" } }
                                    item { DetailAction(enabled = !busy && !active && !cloudManaged, onClick = {
                                        val next = when (history.dwellMinutes) { 5 -> 10; 10 -> 20; 20 -> 30; else -> 5 }
                                        change { repository.setDwellMinutes(next) }
                                    }, label = { Text(stringResource(R.string.location_dwell_setting, history.dwellMinutes)) }) }
                                    item { JournalText(stringResource(R.string.location_places_hint)) }
                                    if (cloudManaged) item { JournalText(stringResource(R.string.location_manage_on_web)) }
                                    history.places.forEach { place -> item {
                                        DetailAction(enabled = !busy && !active && !cloudManaged, onClick = {
                                            editId = place.id; name = place.name; latitude = place.latitude.toString()
                                            longitude = place.longitude.toString(); radius = place.radiusMeters.toInt(); page = "place"
                                        }, label = { Text("${place.name} · ${place.radiusMeters.toInt()} m") })
                                    } }
                                    item { JournalAction(R.string.location_add_place, !busy && !active && !cloudManaged && history.places.size < 20) {
                                        editId = null; name = ""; latitude = ""; longitude = ""; radius = 200; notice = null; page = "place"
                                    } }
                                    item { JournalAction(R.string.location_clear, !busy && !active) { page = "clear" } }
                                }
                            }
                        }
                    }
                } }
            }
        }
    }
}

internal fun validPlaceInput(name: String, latitude: String, longitude: String): Boolean =
    name.isNotBlank() && name.trim().length <= 40 &&
        latitude.toDoubleOrNull()?.let { it.isFinite() && it in -90.0..90.0 } == true &&
        longitude.toDoubleOrNull()?.let { it.isFinite() && it in -180.0..180.0 } == true

private fun journalTime(millis: Long): String = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(millis))

@Composable private fun JournalText(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
}

@Composable private fun JournalAction(label: Int, enabled: Boolean = true, onClick: () -> Unit) {
    DetailAction(onClick = onClick, enabled = enabled, label = { Text(stringResource(label)) })
}

@Composable private fun JournalField(label: String, value: String, enabled: Boolean, onChange: (String) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelSmall)
        BasicTextField(value, { onChange(it.take(40)) }, singleLine = true, enabled = enabled,
            textStyle = TextStyle(color = Color.White, fontSize = 16.sp),
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).background(WatchColors.Surface)
                .padding(10.dp).semantics { contentDescription = label })
    }
}
