package com.haptilog.watch.presentation

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Text

/** Consistent Material 3 action button with primary and secondary labels for Wear settings. */
@Composable
fun SettingAction(
    onClick: () -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    secondaryLabel: String? = null,
    icon: (@Composable RowScope.() -> Unit)? = null,
    enabled: Boolean = true
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = WatchColors.Surface,
            contentColor = WatchColors.Text
        ),
        modifier = modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .heightIn(min = 52.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            icon?.invoke(this)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    maxLines = Int.MAX_VALUE,
                    fontSize = 14.sp,
                    color = WatchColors.Text
                )
                if (secondaryLabel != null) {
                    Text(
                        text = secondaryLabel,
                        maxLines = Int.MAX_VALUE,
                        fontSize = 12.sp,
                        color = WatchColors.Muted
                    )
                }
            }
        }
    }
}
