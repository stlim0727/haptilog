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

class VoiceRecordTileService : TileService() {

    private val RESOURCES_VERSION = "1"

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

        val rubyDot = LayoutElementBuilders.Box.Builder()
            .setWidth(DimensionBuilders.dp(10f))
            .setHeight(DimensionBuilders.dp(10f))
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setBackground(
                        ModifiersBuilders.Background.Builder()
                            .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFFFF3B30.toInt()))
                            .setCorner(
                                ModifiersBuilders.Corner.Builder()
                                    .setRadius(DimensionBuilders.dp(5f))
                                    .build()
                            )
                            .build()
                    )
                    .build()
            )
            .build()

        val recordText = LayoutElementBuilders.Text.Builder()
            .setText("RECORD")
            .setFontStyle(
                LayoutElementBuilders.FontStyle.Builder()
                    .setSize(DimensionBuilders.sp(11f))
                    .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFFF5F5F7.toInt()))
                    .build()
            )
            .build()

        val discContent = LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(rubyDot)
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
                            .setContentDescription("Record voice memo")
                            .build()
                    )
                    .setBackground(
                        ModifiersBuilders.Background.Builder()
                            .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFF161618.toInt()))
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
                            .setColor(androidx.wear.protolayout.ColorBuilders.argb(0xFF2C2C2E.toInt()))
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
                .build()
        )
    }
}
