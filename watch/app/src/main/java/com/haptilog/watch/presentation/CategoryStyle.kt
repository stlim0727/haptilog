package com.haptilog.watch.presentation

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.MaterialTheme
import com.haptilog.watch.R

/** Category is derived metadata, never a recording or synchronization state. */
data class CategoryStyle(val accent: Color, val surface: Color, @DrawableRes val icon: Int)

fun categoryStyle(intent: String?): CategoryStyle = when (intent) {
    "EXPENSE" -> CategoryStyle(Color(0xFFFFD09C), Color(0xFF33261C), R.drawable.ic_receipt)
    "TRAVEL" -> CategoryStyle(Color(0xFFA8D8FF), Color(0xFF142A38), R.drawable.ic_travel)
    "WORKOUT" -> CategoryStyle(Color(0xFF91E4BD), Color(0xFF142D24), R.drawable.ic_workout)
    "MEMO" -> CategoryStyle(Color(0xFFD4BEFF), Color(0xFF29223C), R.drawable.ic_note)
    else -> CategoryStyle(WatchColors.Muted, WatchColors.Surface, R.drawable.ic_mic)
}

@Composable
fun CategoryIcon(style: CategoryStyle, modifier: Modifier = Modifier) {
    // Decorative: adjacent localized category text provides the accessible name.
    Box(modifier.size(42.dp).background(style.accent, CircleShape), contentAlignment = Alignment.Center) {
        Icon(painterResource(style.icon), contentDescription = null,
            tint = style.surface, modifier = Modifier.size(25.dp))
    }
}

@Composable
fun HaptiLogTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = ColorScheme(
        primary = WatchColors.Record, onPrimary = WatchColors.OnRecord,
        primaryContainer = Color(0xFF492017), onPrimaryContainer = Color(0xFFFFDAD1),
        secondary = Color(0xFFD4BEFF), onSecondary = Color(0xFF29223C),
        secondaryContainer = Color(0xFF29223C), onSecondaryContainer = Color(0xFFD4BEFF),
        background = Color.Black, onBackground = WatchColors.Text,
        surfaceContainer = WatchColors.Surface, surfaceContainerLow = Color(0xFF191817),
        surfaceContainerHigh = Color(0xFF34312F), onSurface = WatchColors.Text,
        onSurfaceVariant = WatchColors.Muted, error = WatchColors.Error
    ), content = content)
}
