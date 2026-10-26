package com.haptilog.watch.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.*
import com.haptilog.watch.R
import com.haptilog.watch.service.LocationTrackingService
import com.haptilog.watch.sync.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Independent, explicit location disclosure. Opening this screen never starts tracking. */
class LocationSyncActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            HaptiLogTheme { AppScaffold {
                val scope = rememberCoroutineScope()
                val list = rememberScalingLazyListState(initialCenterItemIndex = 0)
                val tracking by LocationTrackingService.isTracking.collectAsState()
                var enabled by remember { mutableStateOf(LocationConsent.enabled(this@LocationSyncActivity)) }
                var pending by remember { mutableStateOf(false) }
                var busy by remember { mutableStateOf(false) }
                var backfill by remember { mutableStateOf(false) }
                var failed by remember { mutableStateOf(false) }
                LaunchedEffect(Unit) {
                    while (true) {
                        enabled = LocationConsent.enabled(this@LocationSyncActivity)
                        pending = getSharedPreferences("location_sync", MODE_PRIVATE).getBoolean("revoke_pending", false)
                        delay(2_000)
                    }
                }
                ScreenScaffold(scrollState = list) {
                    ScalingLazyColumn(state = list, autoCentering = null,
                        contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 38.dp, bottom = 48.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxSize()) {
                        item { Text(stringResource(R.string.location_sync_title), textAlign = TextAlign.Center) }
                        item { Text(stringResource(R.string.location_sync_disclosure), textAlign = TextAlign.Center) }
                        item { Text(stringResource(R.string.location_sync_places_disclosure), textAlign = TextAlign.Center) }
                        item { Text(stringResource(if (enabled) R.string.location_sync_on else R.string.location_sync_off), textAlign = TextAlign.Center) }
                        if (pending) item { Text(stringResource(R.string.location_sync_withdrawal), textAlign = TextAlign.Center) }
                        if (failed) item { Text(stringResource(R.string.location_sync_error), textAlign = TextAlign.Center) }
                        if (tracking) item { Text(stringResource(R.string.location_sync_stop_first), textAlign = TextAlign.Center) }
                        if (!enabled) {
                            item { DetailAction(enabled = !busy && !pending, onClick = { backfill = !backfill },
                                label = { Text(stringResource(if (backfill) R.string.location_sync_backfill_on else R.string.location_sync_backfill_off)) }) }
                            item { DetailAction(enabled = !busy && !pending && !tracking && CloudClient.configured, onClick = {
                                busy = true; failed = false
                                scope.launch {
                                    try {
                                        withContext(Dispatchers.IO) { LocationConsent.enable(this@LocationSyncActivity, backfill) }
                                        enabled = true
                                    } catch (error: kotlinx.coroutines.CancellationException) { throw error }
                                    catch (_: Exception) { failed = true }
                                    finally { busy = false }
                                }
                            }, label = { Text(stringResource(if (busy) R.string.location_sync_busy else R.string.location_sync_agree)) }) }
                        } else item { DetailAction(enabled = !busy, onClick = {
                            try { LocationConsent.disable(this@LocationSyncActivity); enabled = false; pending = true }
                            catch (_: Exception) { failed = true }
                        }, label = { Text(stringResource(R.string.location_sync_disable)) }) }
                    }
                }
            } }
        }
    }
}
