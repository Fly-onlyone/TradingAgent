/**
 * Trade Export Button Component
 * Provides export functionality for trades data
 */

import {useState} from 'react';
import {
    Button,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    CircularProgress,
} from '@mui/material';
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
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    const open = Boolean(anchorEl);

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

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
            <Button
                variant="outlined"
                startIcon={isExporting ? <CircularProgress size={16}/> : <FileDownloadIcon/>}
                onClick={handleClick}
                disabled={disabled || isExporting}
            >
                Export
            </Button>
            <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
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
