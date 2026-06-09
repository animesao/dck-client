//go:build !linux

package api

func getDiskInfo(path string) (total, used uint64, pct float64) {
	return 0, 0, 0
}
