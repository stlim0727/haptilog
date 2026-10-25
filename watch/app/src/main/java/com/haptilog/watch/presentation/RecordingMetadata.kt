package com.haptilog.watch.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextAlign
import androidx.wear.compose.material3.Text
import com.haptilog.watch.data.RecordingItem

/** Wrap whole date/time/duration tokens rather than splitting Korean day periods or units. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RecordingMetadata(item: RecordingItem, modifier: Modifier = Modifier, compact: Boolean = false, centered: Boolean = false) {
    val context = LocalContext.current
    val dateAndTime = compactRecordingDate(context, item).split(' ', limit = 2)
    val tokens = if (compact) listOf(dateAndTime.first().replace("\u00A0", "").trimEnd('.')) else dateAndTime
    val size = if (compact) 11.sp else 12.sp
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(4.dp,
        if (centered) androidx.compose.ui.Alignment.CenterHorizontally else androidx.compose.ui.Alignment.Start)) {
        tokens.forEach { Text(it, fontSize = size, lineHeight = if (compact) 14.sp else 16.sp, color = WatchColors.Muted, textAlign = TextAlign.Center) }
        Text("·\u00A0" + recordingDuration(context, item.durationSeconds.toLong()),
            fontSize = size, lineHeight = if (compact) 14.sp else 16.sp, color = WatchColors.Muted)
    }
}
