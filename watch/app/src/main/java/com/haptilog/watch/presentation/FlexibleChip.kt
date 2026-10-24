package com.haptilog.watch.presentation

import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipColors
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme

/** Let wrapped labels determine height while preserving a watch-sized touch target. */
@Composable
fun FlexibleChip(
    onClick: () -> Unit,
    label: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    colors: ChipColors = neutralChipColors(),
    shape: Shape = MaterialTheme.shapes.large,
    secondaryLabel: (@Composable androidx.compose.foundation.layout.RowScope.() -> Unit)? = null,
    icon: (@Composable androidx.compose.foundation.layout.BoxScope.() -> Unit)? = null
) {
    Chip(
        onClick = onClick,
        label = label,
        secondaryLabel = secondaryLabel,
        icon = icon,
        enabled = enabled,
        colors = colors,
        shape = shape,
        modifier = modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 52.dp)
    )
}
