# App-specific R8 rules.
# Minimal self-hosted crash reports retain app class names and line numbers.
# The full release mapping is also uploaded to Play and retained with the AAB.
-keepnames class com.haptilog.watch.**
-keepattributes SourceFile,LineNumberTable
