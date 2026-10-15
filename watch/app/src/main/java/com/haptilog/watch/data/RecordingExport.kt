package com.haptilog.watch.data

import android.content.Context
import java.io.OutputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

object RecordingExport {
    fun write(context: Context, id: String, output: OutputStream) {
        require(RecordingFiles.validId(id))
        val directory = RecordingFiles.dir(context)
        val files = listOf("rec_$id.m4a", "meta_$id.json", "enrich_$id.json")
            .map { File(directory, it) }.filter { it.exists() }
        require(files.any { it.name.startsWith("rec_") }) { "Audio missing" }
        ZipOutputStream(output).use { zip ->
            files.forEach { file ->
                zip.putNextEntry(ZipEntry(file.name))
                file.inputStream().use { it.copyTo(zip) }
                zip.closeEntry()
            }
        }
    }
}
