export interface RecipientGroupMember {
  id: string;
  email: string;
  phone: string | null;
  deviceToken: string | null;
  memberName: string | null;
  createdAt: string;
}

export interface RecipientGroup {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  members: RecipientGroupMember[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecipientGroupDto {
  name: string;
  description?: string;
  members?: CreateRecipientGroupMemberDto[];
}

export interface CreateRecipientGroupMemberDto {
  email: string;
  phone?: string;
  deviceToken?: string;
  memberName?: string;
}

export interface UpdateRecipientGroupDto {
  name?: string;
  description?: string;
  isActive?: boolean;
}
