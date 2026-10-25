package com.haptilog.watch.presentation

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material.ChipColors
import androidx.wear.compose.material.ChipDefaults

/** Shared emphasis for the existing Wear Material screens. */
object WatchColors {
    val Surface = Color(0xFF242322)
    val Text = Color(0xFFF5F2EB)
    val Muted = Color(0xFFBAB5AF)
    val Record = Color(0xFFFFB4A5)
    val OnRecord = Color(0xFF492017)
    val Recording = Color(0xFF431D19)
    val Error = Color(0xFFFFA69D)
}

@Composable
fun neutralChipColors(): ChipColors = ChipDefaults.chipColors(
    backgroundColor = WatchColors.Surface,
    contentColor = WatchColors.Text
)

/** Transitional theme for support/consent screens still using Wear Material 2.5 controls. */
@Composable
fun LegacyHaptiLogTheme(content: @Composable () -> Unit) {
    androidx.wear.compose.material.MaterialTheme(colors = androidx.wear.compose.material.Colors(
        primary = WatchColors.Record, onPrimary = WatchColors.OnRecord,
        surface = WatchColors.Surface, onSurface = WatchColors.Text,
        background = Color.Black, onBackground = WatchColors.Text,
        error = WatchColors.Error), content = content)
}
