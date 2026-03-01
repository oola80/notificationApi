"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, UserPlus } from "lucide-react";
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui";
import { ConfirmDialog, EmptyState } from "@/components/shared";
import {
  useRecipientGroupMembers,
  useAddRecipientGroupMember,
  useRemoveRecipientGroupMember,
} from "@/hooks/use-recipient-groups";
import {
  addMemberSchema,
  type AddMemberFormData,
} from "@/lib/validators/recipient-group-schemas";
import { formatDate } from "@/lib/formatters";
import type { RecipientGroupMember } from "@/types";

interface MemberManagerProps {
  groupId: string;
}

function MemberManager({ groupId }: MemberManagerProps) {
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<RecipientGroupMember | null>(null);
  const [removeMemberId, setRemoveMemberId] = React.useState("");

  const { data: members, isLoading, mutate } = useRecipientGroupMembers(groupId);
  const { trigger: addMember, isMutating: isAdding } = useAddRecipientGroupMember(groupId);
  const { trigger: removeMember, isMutating: isRemoving } = useRemoveRecipientGroupMember(groupId, removeMemberId);

  const form = useForm<AddMemberFormData>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      email: "",
      memberName: "",
      phone: "",
      deviceToken: "",
    },
  });

  const handleAddMember = async (data: AddMemberFormData) => {
    try {
      await addMember({
        email: data.email,
        memberName: data.memberName || undefined,
        phone: data.phone || undefined,
        deviceToken: data.deviceToken || undefined,
      });
      toast.success("Member added successfully");
      form.reset();
      setShowAddForm(false);
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add member",
      );
    }
  };

  const handleRemoveMember = async () => {
    try {
      await removeMember();
      toast.success("Member removed successfully");
      setRemoveTarget(null);
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove member",
      );
    }
  };

  const memberList = members ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Members ({memberList.length})</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage recipients in this group
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Add Member
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inline add member form */}
        {showAddForm && (
          <div className="rounded-lg border p-4">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleAddMember)}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="member@example.com"
                            type="email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="memberName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="John Doe"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="+1234567890"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deviceToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Device Token</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Push notification device token"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddForm(false);
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isAdding}>
                    {isAdding && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    <Plus className="mr-2 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}

        {/* Members table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : memberList.length === 0 ? (
          <EmptyState
            title="No members yet"
            description="Add members to this recipient group"
            icon={<UserPlus className="h-10 w-10 text-muted-foreground" />}
            action={
              !showAddForm ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Member
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberList.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      {member.memberName || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {member.email}
                    </TableCell>
                    <TableCell>
                      {member.phone || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(member.createdAt)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setRemoveMemberId(member.id);
                          setRemoveTarget(member);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove member</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <ConfirmDialog
          open={!!removeTarget}
          onOpenChange={(open) => {
            if (!open) setRemoveTarget(null);
          }}
          title="Remove Member"
          description={`Are you sure you want to remove "${removeTarget?.memberName || removeTarget?.email}" from this group?`}
          confirmLabel="Remove"
          onConfirm={handleRemoveMember}
          loading={isRemoving}
        />
      </CardContent>
    </Card>
  );
}

export { MemberManager };
