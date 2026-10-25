package com.haptilog.watch.presentation.tile

import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.DimensionBuilders
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material.Button
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.haptilog.watch.presentation.MainActivity
import com.haptilog.watch.R

class VoiceRecordTileService : TileService() {

    private val RESOURCES_VERSION = "m3-coral-2"

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val launchIntent = ActionBuilders.LaunchAction.Builder()
            .setAndroidActivity(
                ActionBuilders.AndroidActivity.Builder()
                    .setPackageName(packageName)
                    .setClassName(MainActivity::class.java.name)
                    .addKeyToExtraMapping(MainActivity.EXTRA_TOGGLE, ActionBuilders.booleanExtra(true))
                    .build()
            )
            .build()

        val clickModifier = ModifiersBuilders.Clickable.Builder()
            .setId("record_action")
            .setOnClick(launchIntent)
            .build()

        val microphone = LayoutElementBuilders.Image.Builder()
            .setResourceId("microphone")
            .setWidth(DimensionBuilders.dp(32f))
            .setHeight(DimensionBuilders.dp(32f))
            .setColorFilter(LayoutElementBuilders.ColorFilter.Builder()
                .setTint(androidx.wear.protolayout.ColorBuilders.argb(0xFF492017.toInt())).build())
            .build()

        val recordText = LayoutElementBuilders.Text.Builder()
            .setText(getString(R.string.record_start))
            .setFontStyle(
                LayoutElementBuilders.FontStyle.Builder()
                    .setSize(DimensionBuilders.sp(14f))
                    .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFF492017.toInt()))
                    .build()
            )
            .build()

        val discContent = LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(microphone)
            .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(DimensionBuilders.dp(8f)).build())
            .addContent(recordText)
            .build()

        val actionDisc = LayoutElementBuilders.Box.Builder()
            .setWidth(DimensionBuilders.dp(112f))
            .setHeight(DimensionBuilders.dp(112f))
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setClickable(clickModifier)
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
                                    .setRadius(DimensionBuilders.dp(56f))
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

        val rootLayout = LayoutElementBuilders.Box.Builder()
            .setWidth(DimensionBuilders.expand())
            .setHeight(DimensionBuilders.expand())
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setClickable(clickModifier)
                    .setBackground(
                        ModifiersBuilders.Background.Builder()
                            .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFF000000.toInt()))
                            .build()
                    )
                    .build()
            )
            .addContent(actionDisc)
            .build()

        val tile = TileBuilders.Tile.Builder()
            .setResourcesVersion(RESOURCES_VERSION)
            .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(rootLayout))
            .build()

        return Futures.immediateFuture(tile)
    }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> {
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
