package com.haptilog.watch.presentation

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material.ChipColors
import androidx.wear.compose.material.ChipDefaults

/** Shared emphasis for the existing Wear Material screens. */
object WatchColors {
    val Surface = Color(0xFF202622)
    val Text = Color(0xFFF2F4EF)
    val Muted = Color(0xFFAFB9AC)
    val Record = Color(0xFFCF493C)
    val Recording = Color(0xFF431D19)
    val Error = Color(0xFFFFA69D)
}

@Composable
fun neutralChipColors(): ChipColors = ChipDefaults.chipColors(
    backgroundColor = WatchColors.Surface,
    contentColor = WatchColors.Text
)
