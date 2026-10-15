package com.haptilog.watch.presentation.complication

import android.app.PendingIntent
import android.content.Intent
import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.MonochromaticImageComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import com.haptilog.watch.presentation.MainActivity

/**
 * Watch Face Complication provider for HaptiLog.
 * Allows launching voice recording directly from any Wear OS watch face slot.
 */
class HaptiLogComplicationService : SuspendingComplicationDataSourceService() {

    override fun getPreviewData(type: ComplicationType): ComplicationData? {
        val icon = Icon.createWithResource(this, com.haptilog.watch.R.drawable.ic_complication_monolith)
        return when (type) {
            ComplicationType.SHORT_TEXT -> {
                ShortTextComplicationData.Builder(
                    text = PlainComplicationText.Builder("Log").build(),
                    contentDescription = PlainComplicationText.Builder("HaptiLog Voice Record").build()
                )
                    .setMonochromaticImage(MonochromaticImage.Builder(icon).build())
                    .build()
            }
            ComplicationType.MONOCHROMATIC_IMAGE -> {
                MonochromaticImageComplicationData.Builder(
                    monochromaticImage = MonochromaticImage.Builder(icon).build(),
                    contentDescription = PlainComplicationText.Builder("HaptiLog Record").build()
                ).build()
            }
            else -> null
        }
    }

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            putExtra(MainActivity.EXTRA_TOGGLE, true)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val icon = Icon.createWithResource(this, com.haptilog.watch.R.drawable.ic_complication_monolith)

        return when (request.complicationType) {
            ComplicationType.SHORT_TEXT -> {
                ShortTextComplicationData.Builder(
                    text = PlainComplicationText.Builder("Log").build(),
                    contentDescription = PlainComplicationText.Builder("Record Voice Memo").build()
                )
                    .setMonochromaticImage(MonochromaticImage.Builder(icon).build())
                    .setTapAction(pendingIntent)
                    .build()
            }
            ComplicationType.MONOCHROMATIC_IMAGE -> {
                MonochromaticImageComplicationData.Builder(
                    monochromaticImage = MonochromaticImage.Builder(icon).build(),
                    contentDescription = PlainComplicationText.Builder("HaptiLog Record").build()
                )
                    .setTapAction(pendingIntent)
                    .build()
            }
            else -> null
        }
    }
}
