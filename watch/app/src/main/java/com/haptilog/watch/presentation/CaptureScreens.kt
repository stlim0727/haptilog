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
import androidx.wear.compose.material3.lazy.ResponsiveTransformationSpec
import androidx.wear.compose.material3.lazy.TransformationVariableSpec
import com.haptilog.watch.R
import com.haptilog.watch.data.RecordingItem
import java.util.Locale

@Composable
fun CaptureScreen(
    isRecording: Boolean,
    elapsedSeconds: Long,
    isPaused: Boolean = false,
    onToggleRecording: () -> Unit,
    onTogglePause: () -> Unit = {},
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
            ScreenScaffold(scrollState = state, timeText = {
                if (!state.canScrollBackward && !state.isScrollInProgress) TimeText()
            }) {
                ScalingLazyColumn(state = state, autoCentering = null,
                    contentPadding = PaddingValues(start = sidePadding, end = sidePadding, top = 36.dp, bottom = 48.dp),
                    modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { Text(stringResource(if (isPaused) R.string.recording_paused else if (isRecording) R.string.recording_state else R.string.app_name),
                        textAlign = TextAlign.Center) }
                    item { CaptureAction(isRecording, onToggleRecording, Modifier.fillMaxWidth()) }
                    if (isRecording) {
                        item { ElapsedTime(elapsedSeconds, 30) }
                    } else {
                        item { NavigationAction(R.drawable.ic_records, R.string.recordings_action,
                            categoryStyle("MEMO"), onRecordings, Modifier.fillMaxWidth()) }
                        item { NavigationAction(R.drawable.ic_settings, R.string.settings_title,
                            categoryStyle("TRAVEL"), onSettings, Modifier.fillMaxWidth()) }
                    }
                }
            }
        } else if (isRecording) {
            ScreenScaffold {
                Column(Modifier.fillMaxSize().padding(top = 38.dp, bottom = 64.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center) {
                    val badgeColor = if (isPaused) Color(0xFFF2B705) else WatchColors.Record
                    val statusText = stringResource(if (isPaused) R.string.recording_paused else R.string.recording_state)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(7.dp).background(badgeColor, CircleShape))
                        Text(statusText, color = badgeColor,
                            style = MaterialTheme.typography.labelMedium)
                    }
                    Spacer(Modifier.height(8.dp))
                    ElapsedTime(elapsedSeconds, if (compact) 36 else 42)
                }

                Row(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = if (compact) 8.dp else 12.dp)
                        .fillMaxWidth(0.92f),
                    horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally)
                ) {
                    val pauseResumeLabel = stringResource(if (isPaused) R.string.record_resume else R.string.record_pause)
                    Button(
                        onClick = onTogglePause,
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = if (isPaused) WatchColors.Record else Color(0xFF262626),
                            contentColor = if (isPaused) WatchColors.OnRecord else Color.White
                        ),
                        modifier = Modifier.weight(1f).height(48.dp).semantics { contentDescription = pauseResumeLabel }
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(
                                painterResource(if (isPaused) R.drawable.ic_play else R.drawable.ic_pause),
                                null,
                                Modifier.size(16.dp)
                            )
                            Text(
                                stringResource(if (isPaused) R.string.record_resume else R.string.record_pause),
                                fontSize = 11.sp,
                                maxLines = 1
                            )
                        }
                    }

                    val stopLabel = stringResource(R.string.record_stop_accessibility)
                    Button(
                        onClick = onToggleRecording,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isPaused) Color(0xFF262626) else WatchColors.Record,
                            contentColor = if (isPaused) Color.White else WatchColors.OnRecord
                        ),
                        modifier = Modifier.weight(1f).height(48.dp).semantics { contentDescription = stopLabel }
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(painterResource(R.drawable.ic_stop), null, Modifier.size(16.dp))
                            Text(
                                stringResource(R.string.record_stop),
                                fontSize = 11.sp,
                                maxLines = 1
                            )
                        }
                    }
                }
            }
        } else {
            ScreenScaffold {
                Column(Modifier.fillMaxSize().padding(top = if (compact) 28.dp else 30.dp, bottom = 16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(if (compact) 4.dp else 6.dp)) {
                    Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    val recordLabel = stringResource(R.string.record_start_accessibility)
                    Button(onClick = onToggleRecording,
                        shape = CircleShape, contentPadding = PaddingValues(4.dp),
                        modifier = Modifier.size(if (compact) 74.dp else 100.dp).semantics { contentDescription = recordLabel }) {
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(painterResource(R.drawable.ic_mic), null, Modifier.size(36.dp))
                            Text(stringResource(R.string.record_start), fontSize = 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Row(Modifier.fillMaxWidth(.76f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        NavigationAction(R.drawable.ic_records, R.string.recordings_action,
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
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically) {
            Icon(painterResource(icon), null, Modifier.size(20.dp), tint = style.accent)
            Spacer(Modifier.width(5.dp))
            Text(stringResource(label), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center, modifier = Modifier.weight(1f, fill = false))
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
    val transformation = rememberTransformationSpec(
        ResponsiveTransformationSpec.smallScreen(minTransitionAreaHeightFraction = .10f,
            maxTransitionAreaHeightFraction = .20f, contentAlpha = TransformationVariableSpec(1f),
            containerAlpha = TransformationVariableSpec(1f), scale = TransformationVariableSpec(.95f)),
        ResponsiveTransformationSpec.largeScreen(minTransitionAreaHeightFraction = .10f,
            maxTransitionAreaHeightFraction = .20f, contentAlpha = TransformationVariableSpec(1f),
            containerAlpha = TransformationVariableSpec(1f), scale = TransformationVariableSpec(.95f)))
    val expanded = LocalDensity.current.fontScale > 1.3f
    ScreenScaffold(scrollState = listState, timeText = {},
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp,
            top = if (expanded) 36.dp else 30.dp, bottom = 32.dp)) { padding ->
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
        if (!listState.canScrollBackward && !listState.isScrollInProgress) TimeText()
    }
}

@Composable
fun RecordingCard(item: RecordingItem, cloudEnabled: Boolean, onOpen: () -> Unit,
    modifier: Modifier = Modifier, transformation: SurfaceTransformation? = null) {
    val context = LocalContext.current
    val category = categoryStyle(item.intentType)
    val expanded = LocalDensity.current.fontScale > 1.3f
    Card(onClick = onOpen, modifier = modifier.fillMaxWidth(), transformation = transformation,
        colors = CardDefaults.cardColors(containerColor = category.surface),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 9.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            CategoryIcon(category)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(recordingTitle(context, item), fontSize = 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, color = WatchColors.Text)
                Text(categoryLabel(context, item.intentType), color = category.accent,
                    fontSize = 11.sp, lineHeight = 14.sp, fontWeight = FontWeight.SemiBold)
                if (!expanded) RecordingMetadata(item, compact = true)
            }
        }
        if (expanded) {
            Spacer(Modifier.height(4.dp))
            RecordingMetadata(item, compact = true)
        }
        if ((cloudEnabled && item.syncStatus != "SYNCED") ||
            item.syncStatus in setOf("ACTION_REQUIRED", "CAPTURE_FAILED", "RECOVERY_REQUIRED")) {
            Text(recordingSyncLabel(context, item, cloudEnabled), style = MaterialTheme.typography.bodySmall,
                color = if (item.syncStatus in setOf("ACTION_REQUIRED", "CAPTURE_FAILED", "RECOVERY_REQUIRED")) WatchColors.Error else WatchColors.Muted)
        }
    }
}
