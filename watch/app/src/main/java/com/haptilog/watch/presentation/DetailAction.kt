package com.haptilog.watch.presentation

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonColors
import androidx.wear.compose.material3.ButtonDefaults

/** M3 action with intrinsic label height; never cap enlarged text to a fixed chip height. */
@Composable
fun DetailAction(
    onClick: () -> Unit,
    label: @Composable RowScope.() -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    colors: ButtonColors = ButtonDefaults.buttonColors(
        containerColor = WatchColors.Surface, contentColor = WatchColors.Text),
) {
    Button(onClick = onClick, enabled = enabled, colors = colors,
        modifier = modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 52.dp),
        content = label)
}
