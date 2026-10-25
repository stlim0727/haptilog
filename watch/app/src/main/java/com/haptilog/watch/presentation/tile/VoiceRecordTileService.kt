package com.haptilog.watch.presentation.tile

import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.DimensionBuilders
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.haptilog.watch.presentation.MainActivity
import com.haptilog.watch.notifications.RecordingNotifications
import com.haptilog.watch.R

open class VoiceRecordTileService : TileService() {

    private val RESOURCES_VERSION = "m3-coral-3"

    public override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val launchRecordIntent = ActionBuilders.LaunchAction.Builder()
            .setAndroidActivity(
                ActionBuilders.AndroidActivity.Builder()
                    .setPackageName(packageName)
                    .setClassName(MainActivity::class.java.name)
                    .addKeyToExtraMapping(MainActivity.EXTRA_TOGGLE, ActionBuilders.booleanExtra(true))
                    .build()
            )
            .build()

        val recordClickModifier = ModifiersBuilders.Clickable.Builder()
            .setId("record_action")
            .setOnClick(launchRecordIntent)
            .build()

        val launchRecordingsIntent = ActionBuilders.LaunchAction.Builder()
            .setAndroidActivity(
                ActionBuilders.AndroidActivity.Builder()
                    .setPackageName(packageName)
                    .setClassName(MainActivity::class.java.name)
                    .addKeyToExtraMapping(RecordingNotifications.EXTRA_RECORDINGS, ActionBuilders.booleanExtra(true))
                    .build()
            )
            .build()

        val recordingsClickModifier = ModifiersBuilders.Clickable.Builder()
            .setId("recordings_action")
            .setOnClick(launchRecordingsIntent)
            .build()

        val appTitle = LayoutElementBuilders.Text.Builder()
            .setText(getString(R.string.app_name))
            .setFontStyle(
                LayoutElementBuilders.FontStyle.Builder()
                    .setSize(DimensionBuilders.sp(12f))
                    .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFFA1A1AA.toInt()))
                    .build()
            )
            .build()

        val microphone = LayoutElementBuilders.Image.Builder()
            .setResourceId("microphone")
            .setWidth(DimensionBuilders.dp(28f))
            .setHeight(DimensionBuilders.dp(28f))
            .setColorFilter(LayoutElementBuilders.ColorFilter.Builder()
                .setTint(androidx.wear.protolayout.ColorBuilders.argb(0xFF492017.toInt())).build())
            .build()

        val recordText = LayoutElementBuilders.Text.Builder()
            .setText(getString(R.string.record_start))
            .setFontStyle(
                LayoutElementBuilders.FontStyle.Builder()
                    .setSize(DimensionBuilders.sp(13f))
                    .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFF492017.toInt()))
                    .build()
            )
            .build()

        val discContent = LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(microphone)
            .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(DimensionBuilders.dp(4f)).build())
            .addContent(recordText)
            .build()

        val actionDisc = LayoutElementBuilders.Box.Builder()
            .setWidth(DimensionBuilders.dp(98f))
            .setHeight(DimensionBuilders.dp(98f))
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setClickable(recordClickModifier)
                    .setSemantics(
                        ModifiersBuilders.Semantics.Builder()
                            .setContentDescription(getString(R.string.record_start_accessibility))
                            .build()
                    )
                    .setBackground(
                        ModifiersBuilders.Background.Builder()
                            .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFFFFB4A5.toInt()))
                            .setCorner(
                                ModifiersBuilders.Corner.Builder()
                                    .setRadius(DimensionBuilders.dp(49f))
                                    .build()
                            )
                            .build()
                    )
                    .setBorder(
                        ModifiersBuilders.Border.Builder()
                            .setWidth(DimensionBuilders.dp(1f))
                            .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFFFFB4A5.toInt()))
                            .build()
                    )
                    .build()
            )
            .addContent(discContent)
            .build()

        val recordingsText = LayoutElementBuilders.Text.Builder()
            .setText(getString(R.string.recordings_action))
            .setFontStyle(
                LayoutElementBuilders.FontStyle.Builder()
                    .setSize(DimensionBuilders.sp(12f))
                    .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFFE2E2E6.toInt()))
                    .build()
            )
            .build()

        val recordingsButton = LayoutElementBuilders.Box.Builder()
            .setWidth(DimensionBuilders.dp(78f))
            .setHeight(DimensionBuilders.dp(28f))
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setClickable(recordingsClickModifier)
                    .setSemantics(
                        ModifiersBuilders.Semantics.Builder()
                            .setContentDescription(getString(R.string.recordings_action))
                            .build()
                    )
                    .setBackground(
                        ModifiersBuilders.Background.Builder()
                            .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFF242428.toInt()))
                            .setCorner(
                                ModifiersBuilders.Corner.Builder()
                                    .setRadius(DimensionBuilders.dp(14f))
                                    .build()
                            )
                            .build()
                    )
                    .setBorder(
                        ModifiersBuilders.Border.Builder()
                            .setWidth(DimensionBuilders.dp(1f))
                            .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFF38383E.toInt()))
                            .build()
                    )
                    .build()
            )
            .addContent(recordingsText)
            .build()

        val contentColumn = LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(appTitle)
            .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(DimensionBuilders.dp(4f)).build())
            .addContent(actionDisc)
            .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(DimensionBuilders.dp(6f)).build())
            .addContent(recordingsButton)
            .build()

        val rootLayout = LayoutElementBuilders.Box.Builder()
            .setWidth(DimensionBuilders.expand())
            .setHeight(DimensionBuilders.expand())
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setBackground(
                        ModifiersBuilders.Background.Builder()
                            .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFF000000.toInt()))
                            .build()
                    )
                    .build()
            )
            .addContent(contentColumn)
            .build()

        val tile = TileBuilders.Tile.Builder()
            .setResourcesVersion(RESOURCES_VERSION)
            .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(rootLayout))
            .build()

        return Futures.immediateFuture(tile)
    }

    public override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> {
        return Futures.immediateFuture(
            ResourceBuilders.Resources.Builder()
                .setVersion(RESOURCES_VERSION)
                .addIdToImageMapping("microphone", ResourceBuilders.ImageResource.Builder()
                    .setAndroidResourceByResId(ResourceBuilders.AndroidImageResourceByResId.Builder()
                        .setResourceId(R.drawable.ic_mic).build()).build())
                .build()
        )
    }
}
