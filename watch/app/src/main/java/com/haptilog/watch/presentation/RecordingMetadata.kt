package com.haptilog.watch.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Text
import com.haptilog.watch.data.RecordingItem

/** Wrap whole date/time/duration tokens rather than splitting Korean day periods or units. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RecordingMetadata(item: RecordingItem, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val dateAndTime = compactRecordingDate(context, item).split(' ', limit = 2)
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        dateAndTime.forEach { Text(it, fontSize = 12.sp, color = WatchColors.Muted) }
        Text("·\u00A0" + recordingDuration(context, item.durationSeconds.toLong()),
            fontSize = 12.sp, color = WatchColors.Muted)
    }
}
