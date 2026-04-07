{{/*
Expand the name of the chart.
*/}}
{{- define "dmm-torznab.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "dmm-torznab.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "dmm-torznab.labels" -}}
helm.sh/chart: {{ include "dmm-torznab.name" . }}-{{ .Chart.Version | replace "+" "_" }}
{{ include "dmm-torznab.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "dmm-torznab.selectorLabels" -}}
app.kubernetes.io/name: {{ include "dmm-torznab.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
