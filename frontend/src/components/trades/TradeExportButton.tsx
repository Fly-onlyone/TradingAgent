/**
 * Trade Export Button Component
 * Provides export functionality for trades data
 */

import {useState} from 'react';
import {
    Box,
    Button,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    CircularProgress,
} from '@mui/material';
import {useZoomAwareMenu} from '@/hooks/useZoomAwareMenu';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import TableChartIcon from '@mui/icons-material/TableChart';
import CodeIcon from '@mui/icons-material/Code';
import {tradesApi} from '@/api/endpoints/trades';
import type {ExportFormat} from '@/types';

interface TradeExportButtonProps {
    startDate?: string;
    endDate?: string;
    disabled?: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function TradeExportButton({startDate, endDate, disabled}: TradeExportButtonProps) {
    const {anchorRef, handleClose, handleOpen, menuProps, open} = useZoomAwareMenu();
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async (format: ExportFormat) => {
        handleClose();
        setIsExporting(true);

        try {
            const blob = await tradesApi.exportTrades(format, {startDate, endDate});
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `trades_export_${timestamp}.${format}`;
            downloadBlob(blob, filename);
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <>
            <Box ref={anchorRef}>
                <Button
                    variant="outlined"
                    startIcon={isExporting ? <CircularProgress size={16}/> : <FileDownloadIcon/>}
                    onClick={handleOpen}
                    disabled={disabled || isExporting}
                >
                    Export
                </Button>
            </Box>
            <Menu open={open} onClose={handleClose} {...menuProps}>
                <MenuItem onClick={() => handleExport('csv')}>
                    <ListItemIcon>
                        <TableChartIcon fontSize="small"/>
                    </ListItemIcon>
                    <ListItemText>Export as CSV</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => handleExport('json')}>
                    <ListItemIcon>
                        <CodeIcon fontSize="small"/>
                    </ListItemIcon>
                    <ListItemText>Export as JSON</ListItemText>
                </MenuItem>
            </Menu>
        </>
    );
}

export default TradeExportButton;
