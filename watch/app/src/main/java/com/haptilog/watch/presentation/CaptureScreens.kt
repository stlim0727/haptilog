package com.haptilog.watch.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.*
import androidx.wear.compose.material3.*
import androidx.wear.compose.material3.lazy.rememberTransformationSpec
import androidx.wear.compose.material3.lazy.transformedHeight
import com.haptilog.watch.R
import com.haptilog.watch.data.RecordingItem
import java.util.Locale

@Composable
fun CaptureScreen(
    isRecording: Boolean,
    elapsedSeconds: Long,
    onToggleRecording: () -> Unit,
    onRecordings: () -> Unit,
    onSettings: () -> Unit
) {
    val expanded = LocalDensity.current.fontScale > 1.3f
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val compact = maxWidth < 210.dp
        val sidePadding = maxWidth * .09f
        if (expanded) {
            // Keep the stop action reachable without squeezing enlarged text into a circle.
            val state = rememberScalingLazyListState(initialCenterItemIndex = 0)
            ScreenScaffold(scrollState = state) {
                ScalingLazyColumn(state = state, autoCentering = null,
                    contentPadding = PaddingValues(start = sidePadding, end = sidePadding, top = 36.dp, bottom = 48.dp),
                    modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { Text(stringResource(if (isRecording) R.string.recording_state else R.string.app_name),
                        textAlign = TextAlign.Center) }
                    item { CaptureAction(isRecording, onToggleRecording, Modifier.fillMaxWidth()) }
                    if (isRecording) {
                        item { ElapsedTime(elapsedSeconds, 30) }
                    } else {
                        item { NavigationAction(R.drawable.ic_records, R.string.recordings_title,
                            categoryStyle("MEMO"), onRecordings, Modifier.fillMaxWidth()) }
                        item { NavigationAction(R.drawable.ic_settings, R.string.settings_title,
                            categoryStyle("TRAVEL"), onSettings, Modifier.fillMaxWidth()) }
                    }
                }
            }
        } else if (isRecording) {
            ScreenScaffold {
                Column(Modifier.fillMaxSize().padding(top = 44.dp, bottom = 58.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(7.dp).background(WatchColors.Record, CircleShape))
                        Text(stringResource(R.string.recording_state), color = WatchColors.Record,
                            style = MaterialTheme.typography.labelMedium)
                    }
                    Spacer(Modifier.height(8.dp))
                    ElapsedTime(elapsedSeconds, if (compact) 36 else 44)
                }
                val stopLabel = stringResource(R.string.record_stop_accessibility)
                EdgeButton(onClick = onToggleRecording,
                    modifier = Modifier.align(Alignment.BottomCenter).semantics { contentDescription = stopLabel }) {
                    Icon(painterResource(R.drawable.ic_stop), null, Modifier.size(22.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.record_stop))
                }
            }
        } else {
            ScreenScaffold {
                Column(Modifier.fillMaxSize().padding(top = if (compact) 28.dp else 32.dp, bottom = 22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(if (compact) 4.dp else 7.dp)) {
                    Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleSmall)
                    val recordLabel = stringResource(R.string.record_start_accessibility)
                    Button(onClick = onToggleRecording,
                        shape = CircleShape, contentPadding = PaddingValues(4.dp),
                        modifier = Modifier.size(if (compact) 68.dp else 82.dp).semantics { contentDescription = recordLabel }) {
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(painterResource(R.drawable.ic_mic), null, Modifier.size(30.dp))
                            Text(stringResource(R.string.record_start), style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    Row(Modifier.fillMaxWidth(.76f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        NavigationAction(R.drawable.ic_records, R.string.recordings_title,
                            categoryStyle("MEMO"), onRecordings, Modifier.weight(1f))
                        NavigationAction(R.drawable.ic_settings, R.string.settings_title,
                            categoryStyle("TRAVEL"), onSettings, Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun CaptureAction(recording: Boolean, onClick: () -> Unit, modifier: Modifier) {
    val label = stringResource(if (recording) R.string.record_stop_accessibility else R.string.record_start_accessibility)
    Button(onClick, modifier.semantics { contentDescription = label }, contentPadding = PaddingValues(12.dp)) {
        Icon(painterResource(if (recording) R.drawable.ic_stop else R.drawable.ic_mic), null, Modifier.size(24.dp))
        Spacer(Modifier.width(6.dp))
        Text(stringResource(if (recording) R.string.record_stop else R.string.record_start))
    }
}

@Composable
private fun ElapsedTime(seconds: Long, size: Int) {
    val state = stringResource(R.string.recording_state)
    Text(String.format(Locale.US, "%02d:%02d", seconds / 60, seconds % 60),
        fontSize = size.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace,
        modifier = Modifier.semantics { stateDescription = state })
}

@Composable
private fun NavigationAction(icon: Int, label: Int, style: CategoryStyle, onClick: () -> Unit, modifier: Modifier) {
    Button(onClick, modifier.heightIn(min = 48.dp),
        colors = ButtonDefaults.buttonColors(containerColor = style.surface, contentColor = WatchColors.Text),
        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 8.dp)) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(painterResource(icon), null, Modifier.size(20.dp), tint = style.accent)
            Text(stringResource(label), style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center)
        }
    }
}

@Composable
fun RecordingsScreen(
    recordings: List<RecordingItem>,
    listState: TransformingLazyColumnState,
    cloudEnabled: Boolean,
    notice: String?,
    onOpenRecording: (RecordingItem) -> Unit
) {
    val transformation = rememberTransformationSpec()
    ScreenScaffold(scrollState = listState, contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 36.dp, bottom = 48.dp)) { padding ->
        TransformingLazyColumn(state = listState, contentPadding = padding,
            modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Text(stringResource(R.string.recordings_title), style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(bottom = 4.dp)) }
            notice?.let { item { Text(it, color = WatchColors.Error) } }
            if (recordings.isEmpty()) item {
                Column(Modifier.fillMaxWidth().padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(painterResource(R.drawable.ic_mic), null, Modifier.size(32.dp), tint = WatchColors.Muted)
                    Text(stringResource(R.string.no_recordings), textAlign = TextAlign.Center)
                    Text(stringResource(R.string.first_recording_hint), color = WatchColors.Muted,
                        style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
                }
            }
            items(recordings, key = { it.id }) { item ->
                RecordingCard(item, cloudEnabled, onOpen = { onOpenRecording(item) },
                    modifier = Modifier.transformedHeight(this, transformation),
                    transformation = SurfaceTransformation(transformation))
            }
        }
    }
}

@Composable
fun RecordingCard(item: RecordingItem, cloudEnabled: Boolean, onOpen: () -> Unit,
    modifier: Modifier = Modifier, transformation: SurfaceTransformation? = null) {
    val context = LocalContext.current
    val category = categoryStyle(item.intentType)
    Card(onClick = onOpen, modifier = modifier.fillMaxWidth(), transformation = transformation,
        colors = CardDefaults.cardColors(containerColor = category.surface),
        contentPadding = PaddingValues(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            CategoryIcon(category)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(recordingTitle(context, item), style = MaterialTheme.typography.titleSmall,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, color = WatchColors.Text)
                Text(categoryLabel(context, item.intentType), color = category.accent, style = MaterialTheme.typography.labelSmall)
            }
        }
        Spacer(Modifier.height(6.dp))
        RecordingMetadata(item)
        if ((cloudEnabled && item.syncStatus != "SYNCED") ||
            item.syncStatus in setOf("ACTION_REQUIRED", "CAPTURE_FAILED", "RECOVERY_REQUIRED")) {
            Text(recordingSyncLabel(context, item, cloudEnabled), style = MaterialTheme.typography.bodySmall,
                color = if (item.syncStatus in setOf("ACTION_REQUIRED", "CAPTURE_FAILED", "RECOVERY_REQUIRED")) WatchColors.Error else WatchColors.Muted)
        }
    }
}
