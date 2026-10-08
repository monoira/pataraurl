import ArrowDownward from "@mui/icons-material/ArrowDownward";
import ArrowUpward from "@mui/icons-material/ArrowUpward";
import Delete from "@mui/icons-material/Delete";
import UnfoldMore from "@mui/icons-material/UnfoldMore";
import {
  Alert,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import {
  useDeleteUserMutation,
  useGetUsersQuery,
  useUpdateUserMutation,
  type SortOrder,
  type UserSortField,
} from "../api/usersApi";
import { useAppSelector } from "../hooks";
import { Role } from "../types/auth";
import SEO from "../components/SEO";

const pageSize = 10;

function AdminDashboardRoute() {
  const { i18n, t } = useTranslation(["adminDashboard", "common"]);
  const user = useAppSelector((state) => state.auth.user);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<Role | undefined>();
  const [sortBy, setSortBy] = useState<UserSortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("ASC");
  const [deleteUser, { isLoading: isDeleting }] = useDeleteUserMutation();
  const [updateUser] = useUpdateUserMutation();
  const [confirmDialog, setConfirmDialog] = useState<{
    type: "delete" | "role";
    userId: number;
    newRole?: Role;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  const {
    data: users = [],
    isLoading,
    isError,
  } = useGetUsersQuery(
    { page, limit: pageSize, role, sortBy, sortOrder },
    { skip: user?.role !== Role.OWNER && user?.role !== Role.ADMIN },
  );
  if (!user) return null;
  if (user.role !== Role.OWNER && user.role !== Role.ADMIN) {
    return <Navigate replace to="/" />;
  }

  const changeRole = (value: string) => {
    setRole(value ? (value as Role) : undefined);
    setPage(1);
  };

  const changeSort = (field: UserSortField) => {
    setSortOrder(sortBy === field && sortOrder === "ASC" ? "DESC" : "ASC");
    setSortBy(field);
    setPage(1);
  };

  const sortIcon = (field: UserSortField) => {
    if (sortBy !== field) return <UnfoldMore sx={{ fontSize: "small" }} />;
    return sortOrder === "ASC" ? (
      <ArrowUpward sx={{ fontSize: "small" }} />
    ) : (
      <ArrowDownward sx={{ fontSize: "small" }} />
    );
  };

  const sortLabel = (field: UserSortField, label: string) => (
    <Button
      size="small"
      sx={{ fontWeight: "fontWeightBold", minWidth: 0 }}
      onClick={() => changeSort(field)}
      type="button"
    >
      {label}
      {sortIcon(field)}
    </Button>
  );

  const formatDate = (value: string | null | undefined) => {
    const timestamp = value ? new Date(value).getTime() : Number.NaN;
    if (!Number.isFinite(timestamp)) return "-";

    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(timestamp);
  };

  const removeUser = async (id: number) => {
    try {
      await deleteUser(id).unwrap();
    } catch {
      setError(t("common:error"));
    } finally {
      setConfirmDialog(null);
    }
  };

  const changeUserRole = async (id: number, role: Role) => {
    try {
      await updateUser({ id, role }).unwrap();
    } catch {
      setError(t("common:error"));
    } finally {
      setConfirmDialog(null);
    }
  };

  return (
    <>
      <SEO
        title={t("adminDashboard:htmlTag.title")}
        description={t("adminDashboard:htmlTag.description")}
      />
      <Container component="main" maxWidth="lg" sx={{ py: 5 }}>
        <Stack
          direction="row"
          sx={{
            mb: 2.5,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: "fontWeightBold" }}>
            {t("adminDashboard:accounts", { count: users.length })}
          </Typography>
          <Select
            size="small"
            value={role ?? ""}
            displayEmpty
            sx={{ minWidth: 150 }}
            onChange={(event) => changeRole(event.target.value)}
          >
            <MenuItem value="">{t("adminDashboard:allRoles")}</MenuItem>
            <MenuItem value={Role.OWNER}>{t("adminDashboard:owner")}</MenuItem>
            <MenuItem value={Role.ADMIN}>{t("adminDashboard:admin")}</MenuItem>
            <MenuItem value={Role.MEMBER}>
              {t("adminDashboard:member")}
            </MenuItem>
          </Select>
        </Stack>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {isError ? (
          <Alert severity="warning">{t("adminDashboard:loadError")}</Alert>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    {sortLabel("name", t("adminDashboard:name"))}
                  </TableCell>
                  <TableCell>
                    {sortLabel("email", t("adminDashboard:email"))}
                  </TableCell>
                  <TableCell>
                    {sortLabel("role", t("adminDashboard:role"))}
                  </TableCell>
                  <TableCell>
                    {sortLabel("createdAt", t("adminDashboard:createdAt"))}
                  </TableCell>
                  <TableCell>
                    {sortLabel("updatedAt", t("adminDashboard:updatedAt"))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell sx={{ fontWeight: "fontWeightBold" }}>
                      {member.name}
                    </TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.role}</TableCell>
                    <TableCell>{formatDate(member.createdAt)}</TableCell>
                    <TableCell>{formatDate(member.updatedAt)}</TableCell>
                    <TableCell align="right">
                      <Stack
                        component="div"
                        direction="row"
                        sx={{ justifyContent: "flex-end" }}
                      >
                        <Select
                          size="small"
                          value={member.role}
                          onChange={(e) =>
                            setConfirmDialog({
                              type: "role",
                              userId: member.id,
                              newRole: e.target.value as Role,
                            })
                          }
                        >
                          <MenuItem value={Role.OWNER}>{Role.OWNER}</MenuItem>
                          <MenuItem value={Role.ADMIN}>{Role.ADMIN}</MenuItem>
                          <MenuItem value={Role.MEMBER}>{Role.MEMBER}</MenuItem>
                        </Select>
                        <IconButton
                          aria-label={t("adminDashboard:remove")}
                          color="error"
                          size="small"
                          disabled={isDeleting}
                          onClick={() =>
                            setConfirmDialog({
                              type: "delete",
                              userId: member.id,
                            })
                          }
                          title={t("adminDashboard:remove")}
                        >
                          <Delete sx={{ fontSize: "small" }} />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Dialog open={!!confirmDialog} onClose={() => setConfirmDialog(null)}>
          <DialogTitle>
            {confirmDialog?.type === "delete"
              ? t("adminDashboard:confirmDelete")
              : t("adminDashboard:confirmRoleChange")}
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              {confirmDialog?.type === "delete"
                ? t("adminDashboard:confirmDeleteMessage")
                : t("adminDashboard:confirmRoleChangeMessage", {
                    role: confirmDialog?.newRole as string,
                  })}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDialog(null)}>
              {t("common:cancel")}
            </Button>
            <Button
              onClick={() => {
                if (confirmDialog?.type === "delete") {
                  removeUser(confirmDialog.userId);
                } else if (
                  confirmDialog?.type === "role" &&
                  confirmDialog.newRole
                ) {
                  changeUserRole(confirmDialog.userId, confirmDialog.newRole);
                }
              }}
              color="error"
            >
              {t("common:confirm")}
            </Button>
          </DialogActions>
        </Dialog>
        <Stack
          direction="row"
          sx={{ mt: 2, justifyContent: "flex-end" }}
          spacing={1}
        >
          <Button
            size="small"
            variant="outlined"
            disabled={page === 1 || isLoading}
            onClick={() => setPage((currentPage) => currentPage - 1)}
          >
            {t("adminDashboard:previous")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={users.length < pageSize || isLoading}
            onClick={() => setPage((currentPage) => currentPage + 1)}
          >
            {t("adminDashboard:next")}
          </Button>
        </Stack>
      </Container>
    </>
  );
}

export default AdminDashboardRoute;
