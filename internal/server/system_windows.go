package server

// Windows stubs for system info functions

func getUptime() string {
	return "N/A (Windows)"
}

func getCPUInfo() string {
	return "N/A (Windows)"
}

func getMemoryInfo() string {
	return "N/A (Windows)"
}

func getDiskInfo(path string) string {
	return "N/A (Windows)"
}
