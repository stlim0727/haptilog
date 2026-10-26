package com.haptilog.watch.presentation

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.*
import com.haptilog.watch.R
import com.haptilog.watch.data.location.LocationHistoryRepository
import com.haptilog.watch.data.location.LocationStay
import com.haptilog.watch.data.location.LocationStayEndReason
import com.haptilog.watch.data.location.LocationStayStatus
import com.haptilog.watch.data.location.SavedPlace
import com.haptilog.watch.data.location.distanceMeters
import com.haptilog.watch.service.LocationTrackingService
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Date

/**
 * Start, stop, and read the stays. The system permission prompt is the only consent step; places
 * and the stay threshold are edited in the portal, and sharing follows the cloud sync switch.
 */
class LocationJournalActivity : ComponentActivity() {
    private var notice by mutableStateOf<String?>(null)
    private var busy by mutableStateOf(false)

    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        if (hasFineLocation()) startTracking() else notice = getString(R.string.location_permission_needed)
    }

    private fun hasFineLocation() = ContextCompat.checkSelfPermission(this,
        Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** One tap: whatever the system has not granted yet is asked for here. */
    private fun startOrRequest() {
        notice = null
        val notificationsGranted = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (hasFineLocation() && notificationsGranted) startTracking()
        else {
            val requested = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            if (Build.VERSION.SDK_INT >= 33) requested += Manifest.permission.POST_NOTIFICATIONS
            permissions.launch(requested.toTypedArray())
        }
    }

    private fun startTracking() {
        try {
            ContextCompat.startForegroundService(this, Intent(this, LocationTrackingService::class.java)
                .setAction(LocationTrackingService.ACTION_START))
        } catch (_: RuntimeException) { notice = getString(R.string.location_start_failed) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
                    var displayNow by remember { mutableLongStateOf(System.currentTimeMillis()) }
                    LaunchedEffect(Unit) {
                        while (true) { kotlinx.coroutines.delay(30_000); displayNow = System.currentTimeMillis() }
                    }
                    val active by LocationTrackingService.isTracking.collectAsState()
                    val serviceNotice by LocationTrackingService.status.collectAsState()
                    var limit by remember { mutableIntStateOf(30) }
                    val list = rememberScalingLazyListState(initialCenterItemIndex = 0)
                    ScreenScaffold(scrollState = list) {
                        ScalingLazyColumn(state = list, autoCentering = null,
                            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 38.dp, bottom = 48.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
                            item { Text(stringResource(R.string.location_journal_title), textAlign = TextAlign.Center) }
                            (notice ?: serviceNotice)?.let { item { JournalText(it) } }
                            item { JournalText(stringResource(if (active) R.string.location_running else R.string.location_stopped)) }
                            item { JournalAction(if (active) R.string.location_stop else R.string.location_start, !busy) {
                                if (active) startService(Intent(this@LocationJournalActivity, LocationTrackingService::class.java)
                                    .setAction(LocationTrackingService.ACTION_STOP)) else startOrRequest()
                            } }
                            item { JournalText(stringResource(R.string.location_web_managed)) }
                            if (active && history.latestSample == null) item { JournalText(stringResource(R.string.location_waiting_fix)) }
                            history.latestSample?.let { point -> item { JournalText(stringResource(R.string.location_last_fix, journalTime(point.timestampMillis))) } }
                            if (history.stays.isEmpty()) item { JournalText(stringResource(R.string.location_no_events)) }
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
                                JournalText("$stateLabel\n" +
                                    "${stayPlaceName(stay, history.places) ?: stringResource(R.string.location_unsaved_place)} · " +
                                    stringResource(R.string.location_minutes, stay.observedDurationMillis / 60_000) + "\n" +
                                    journalTime(stay.startedAtMillis) + " – " + journalTime(stay.lastObservedAtMillis))
                            } }
                            if (limit < history.stays.size) item { JournalAction(R.string.location_more) { limit += 30 } }
                        }
                    }
                } }
            }
        }
    }
}

/** A stay belongs to a place only when exactly one saved area contains its representative point. */
internal fun stayPlaceName(stay: LocationStay, places: List<SavedPlace>): String? {
    val matches = places.filter {
        distanceMeters(stay.representativeLatitude, stay.representativeLongitude, it.latitude, it.longitude) +
            stay.accuracyMeters <= it.radiusMeters
    }
    return matches.singleOrNull()?.name
}

private fun journalTime(millis: Long): String = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(millis))

@Composable private fun JournalText(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
}

@Composable private fun JournalAction(label: Int, enabled: Boolean = true, onClick: () -> Unit) {
    DetailAction(onClick = onClick, enabled = enabled, label = { Text(stringResource(label)) })
}
