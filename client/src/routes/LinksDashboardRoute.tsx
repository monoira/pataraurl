import BarChart from "@mui/icons-material/BarChart";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import Edit from "@mui/icons-material/Edit";
import LinkIcon from "@mui/icons-material/Link";
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import {
  useCreateShortenMutation,
  useDeleteShortenMutation,
  useGetAllShortensQuery,
  useGetShortenStatsQuery,
  useUpdateShortenMutation,
  type ShortenItem,
} from "../api/shortenApi";
import { useAppSelector } from "../hooks";
import SEO from "../components/SEO";

function LinksDashboardRoute() {
  const { i18n, t } = useTranslation(["linksDashboard", "common"]);
  const user = useAppSelector((state) => state.auth.user);

  const { data: fetchedLinks } = useGetAllShortensQuery();

  const [urlInput, setUrlInput] = useState("");
  // Derive the links directly from the query data to avoid useEffect synchronization
  const links = fetchedLinks ?? [];

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [editDialog, setEditDialog] = useState<ShortenItem | null>(null);
  const [editUrl, setEditUrl] = useState("");

  const [statsCode, setStatsCode] = useState<string | null>(null);

  const [deleteConfirmCode, setDeleteConfirmCode] = useState<string | null>(
    null,
  );

  const [createShorten, { isLoading: isCreating }] = useCreateShortenMutation();
  const [updateShorten, { isLoading: isUpdating }] = useUpdateShortenMutation();
  const [deleteShorten, { isLoading: isDeleting }] = useDeleteShortenMutation();

  const { data: statsData, isFetching: isStatsLoading } =
    useGetShortenStatsQuery(statsCode ?? "", { skip: !statsCode });

  if (!user) {
    return <Navigate replace to="/login" />;
  }

  const handleCreate = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!urlInput.trim()) {
      setErrorMsg(t("linksDashboard:urlRequired"));
      return;
    }

    try {
      await createShorten({ url: urlInput.trim() }).unwrap();
      setUrlInput("");
      setSuccessMsg(t("linksDashboard:copied"));
    } catch {
      setErrorMsg(t("linksDashboard:loadError"));
    }
  };

  const handleCopy = (shortCode: string) => {
    const fullUrl = `${window.location.origin}/s/${shortCode}`;
    navigator.clipboard.writeText(fullUrl);
    setSuccessMsg(t("linksDashboard:copied"));
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleSaveEdit = async () => {
    if (!editDialog || !editUrl.trim()) return;
    try {
      await updateShorten({
        shortCode: editDialog.shortCode,
        url: editUrl.trim(),
      }).unwrap();

      setEditDialog(null);
      setEditUrl("");
    } catch {
      setErrorMsg(t("linksDashboard:loadError"));
    }
  };

  const handleDelete = async (shortCode: string) => {
    try {
      await deleteShorten(shortCode).unwrap();
      setDeleteConfirmCode(null);
    } catch {
      setErrorMsg(t("linksDashboard:loadError"));
    }
  };

  const formatDate = (value: string | null | undefined) => {
    const timestamp = value ? new Date(value).getTime() : Number.NaN;
    if (!Number.isFinite(timestamp)) return "-";

    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(timestamp);
  };

  return (
    <>
      <SEO
        title={t("linksDashboard:htmlTag.title")}
        description={t("linksDashboard:htmlTag.description")}
      />
      <Container component="main" maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: "fontWeightBold", mb: 3 }}>
          {t("linksDashboard:title")}
        </Typography>

        {errorMsg && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            onClose={() => setErrorMsg(null)}
          >
            {errorMsg}
          </Alert>
        )}

        {successMsg && (
          <Alert
            severity="success"
            sx={{ mb: 2 }}
            onClose={() => setSuccessMsg(null)}
          >
            {successMsg}
          </Alert>
        )}

        <Paper
          component="form"
          onSubmit={handleCreate}
          variant="outlined"
          sx={{
            p: 3,
            mb: 4,
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <TextField
            label={t("linksDashboard:hereWriteALink")}
            variant="outlined"
            size="small"
            fullWidth
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/very/long/url"
            sx={{ flexGrow: 1 }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={isCreating}
            startIcon={<LinkIcon />}
            sx={{ color: "primary.contrastText" }}
          >
            {t("linksDashboard:shortenButton")}
          </Button>
        </Paper>

        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t("linksDashboard:hereWriteALink")}</TableCell>
                <TableCell>{t("linksDashboard:shortCode")}</TableCell>
                <TableCell>{t("linksDashboard:createdAt")}</TableCell>
                <TableCell align="right">
                  {t("linksDashboard:actions")}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {links.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    align="center"
                    sx={{ py: 4, color: "text.secondary" }}
                  >
                    {t("linksDashboard:noLinks")}
                  </TableCell>
                </TableRow>
              ) : (
                links.map((link) => (
                  <TableRow key={link.shortCode}>
                    <TableCell
                      sx={{
                        maxWidth: 250,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={link.url}
                    >
                      {link.url}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: "fontWeightBold",
                        color: "primary.main",
                      }}
                    >
                      {link.shortCode}
                    </TableCell>
                    <TableCell>{formatDate(link.createdAt)}</TableCell>
                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={0.5}
                        sx={{ justifyContent: "flex-end" }}
                      >
                        <IconButton
                          size="small"
                          title={t("linksDashboard:copy")}
                          onClick={() => handleCopy(link.shortCode)}
                        >
                          <ContentCopy sx={{ fontSize: "small" }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          title={t("linksDashboard:stats")}
                          onClick={() => setStatsCode(link.shortCode)}
                        >
                          <BarChart sx={{ fontSize: "small" }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          title={t("linksDashboard:edit")}
                          onClick={() => {
                            setEditDialog(link);
                            setEditUrl(link.url);
                          }}
                        >
                          <Edit sx={{ fontSize: "small" }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          title={t("linksDashboard:delete")}
                          onClick={() => setDeleteConfirmCode(link.shortCode)}
                        >
                          <Delete sx={{ fontSize: "small" }} />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Edit Dialog */}
        <Dialog open={!!editDialog} onClose={() => setEditDialog(null)}>
          <DialogTitle>{t("linksDashboard:edit")}</DialogTitle>
          <DialogContent sx={{ pt: 2, minWidth: 400 }}>
            <TextField
              label={t("linksDashboard:hereWriteALink")}
              fullWidth
              size="small"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditDialog(null)}>
              {t("linksDashboard:cancel")}
            </Button>
            <Button
              onClick={handleSaveEdit}
              variant="contained"
              disabled={isUpdating || !editUrl.trim()}
            >
              {t("linksDashboard:save")}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Stats Dialog */}
        <Dialog open={!!statsCode} onClose={() => setStatsCode(null)}>
          <DialogTitle>{t("linksDashboard:statsTitle")}</DialogTitle>
          <DialogContent sx={{ minWidth: 300, pt: 2 }}>
            {isStatsLoading ? (
              <Typography>{t("common:loading")}</Typography>
            ) : statsData ? (
              <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {t("linksDashboard:shortCode")}: {statsData.shortCode}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ mb: 1, wordBreak: "break-all" }}
                >
                  {t("linksDashboard:hereWriteALink")}: {statsData.url}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: "fontWeightBold",
                    color: "primary.main",
                    mt: 2,
                  }}
                >
                  {t("linksDashboard:totalAccesses")}:{" "}
                  {statsData.accessCount ?? 0}
                </Typography>
              </Box>
            ) : (
              <Typography>{t("linksDashboard:loadError")}</Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setStatsCode(null)}>
              {t("linksDashboard:close")}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={!!deleteConfirmCode}
          onClose={() => setDeleteConfirmCode(null)}
        >
          <DialogTitle>{t("linksDashboard:delete")}</DialogTitle>
          <DialogContent>
            <Typography>{t("linksDashboard:deleteConfirm")}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirmCode(null)}>
              {t("linksDashboard:cancel")}
            </Button>
            <Button
              onClick={() =>
                deleteConfirmCode && handleDelete(deleteConfirmCode)
              }
              color="error"
              variant="contained"
              disabled={isDeleting}
            >
              {t("linksDashboard:delete")}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </>
  );
}

export default LinksDashboardRoute;
