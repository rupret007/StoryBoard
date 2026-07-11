import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  renderBookingTemplate,
  type BookingCampaignCreateInput,
  type BookingCampaignPatchInput,
  type BookingCampaignPrepareApprovalInput,
  type BookingCampaignRecipientCreateInput,
  type BookingCampaignRecipientPatchInput
} from "@storyboard/shared";
import {
  ApprovalStatus,
  BookingCampaignDeliveryMode,
  BookingCampaignRecipientStatus,
  BookingCampaignStatus
} from "../generated/prisma/enums";
import { ApprovalsService } from "../approvals/approvals.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { BookingProfilesService } from "./booking-profiles.service";

const campaignInclude = {
  marketSprint: true,
  recipients: {
    include: {
      prospect: true,
      contact: true,
      opportunity: { include: { venue: true } },
      followUpTask: true
    },
    orderBy: { createdAt: "asc" }
  }
} as const;

@Injectable()
export class BookingCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly profiles: BookingProfilesService,
    private readonly approvals: ApprovalsService
  ) {}

  list(artistId: string) {
    return this.prisma.client.bookingCampaign.findMany({
      where: { artistId },
      include: campaignInclude,
      orderBy: { updatedAt: "desc" }
    });
  }

  async get(artistId: string, id: string) {
    const campaign = await this.prisma.client.bookingCampaign.findFirst({
      where: { id, artistId },
      include: campaignInclude
    });
    if (!campaign) throw new NotFoundException("Booking campaign not found");
    return campaign;
  }

  private async assertContact(artistId: string, id: string) {
    const contact = await this.prisma.client.contact.findFirst({
      where: { id, artistId },
      select: { id: true, email: true, fullName: true }
    });
    if (!contact) throw new NotFoundException("Contact not found");
    return contact;
  }

  private async assertOpportunity(artistId: string, id: string) {
    const opportunity = await this.prisma.client.bookingOpportunity.findFirst({
      where: { id, artistId },
      select: { id: true }
    });
    if (!opportunity) throw new NotFoundException("Booking opportunity not found");
    return opportunity;
  }

  private async assertMarketSprint(artistId: string, id: string) {
    const sprint = await this.prisma.client.bookingMarketSprint.findFirst({
      where: { id, artistId }, select: { id: true }
    });
    if (!sprint) throw new NotFoundException("Booking market sprint not found");
    return sprint;
  }

  async create(
    artistId: string,
    input: BookingCampaignCreateInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    await this.profiles.assertReady(artistId);
    if (input.status && input.status !== BookingCampaignStatus.draft) {
      throw new BadRequestException("New campaigns must start as drafts");
    }
    if (input.marketSprintId) await this.assertMarketSprint(artistId, input.marketSprintId);
    const campaign = await this.prisma.client.bookingCampaign.create({
      data: {
        artistId,
        name: input.name,
        status: BookingCampaignStatus.draft,
        dateWindowStart: input.dateWindowStart
          ? new Date(input.dateWindowStart)
          : null,
        dateWindowEnd: input.dateWindowEnd ? new Date(input.dateWindowEnd) : null,
        subjectTemplate: input.subjectTemplate,
        bodyTemplate: input.bodyTemplate,
        defaultFollowUpDays: input.defaultFollowUpDays ?? 7,
        deliveryMode: input.deliveryMode ?? BookingCampaignDeliveryMode.draft_only,
        marketSprintId: input.marketSprintId ?? null
      },
      include: campaignInclude
    });
    await this.audit.log({
      artistId,
      aggregateType: "BookingCampaign",
      aggregateId: campaign.id,
      action: "booking_campaign.created",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { name: campaign.name, status: campaign.status }
    });
    return campaign;
  }

  async patch(
    artistId: string,
    id: string,
    input: BookingCampaignPatchInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    const current = await this.get(artistId, id);
    if (
      current.approvalRequestId &&
      (input.subjectTemplate !== undefined || input.bodyTemplate !== undefined)
    ) {
      throw new BadRequestException(
        "Email templates cannot change after an approval batch has been prepared"
      );
    }
    if (input.marketSprintId != null) await this.assertMarketSprint(artistId, input.marketSprintId);
    if (
      input.status === BookingCampaignStatus.active &&
      !current.approvalRequestId
    ) {
      throw new BadRequestException(
        "A campaign becomes active only when its approval batch is prepared"
      );
    }
    const start =
      input.dateWindowStart === undefined
        ? current.dateWindowStart
        : input.dateWindowStart
          ? new Date(input.dateWindowStart)
          : null;
    const end =
      input.dateWindowEnd === undefined
        ? current.dateWindowEnd
        : input.dateWindowEnd
          ? new Date(input.dateWindowEnd)
          : null;
    if (start && end && start > end) {
      throw new BadRequestException(
        "Campaign date window end must be on or after its start"
      );
    }
    const patch = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.dateWindowStart !== undefined
        ? { dateWindowStart: start }
        : {}),
      ...(input.dateWindowEnd !== undefined ? { dateWindowEnd: end } : {}),
      ...(input.subjectTemplate !== undefined
        ? { subjectTemplate: input.subjectTemplate }
        : {}),
      ...(input.bodyTemplate !== undefined ? { bodyTemplate: input.bodyTemplate } : {}),
      ...(input.defaultFollowUpDays !== undefined
        ? { defaultFollowUpDays: input.defaultFollowUpDays }
        : {}),
      ...(input.deliveryMode !== undefined ? { deliveryMode: input.deliveryMode } : {}),
      ...(input.marketSprintId !== undefined ? { marketSprintId: input.marketSprintId } : {})
    };
    const campaign = await this.prisma.client.bookingCampaign.update({
      where: { id },
      data: patch,
      include: campaignInclude
    });
    await this.audit.log({
      artistId,
      aggregateType: "BookingCampaign",
      aggregateId: id,
      action: "booking_campaign.updated",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { updatedFields: Object.keys(input) }
    });
    return campaign;
  }

  async addRecipient(
    artistId: string,
    campaignId: string,
    input: BookingCampaignRecipientCreateInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    await this.profiles.assertReady(artistId);
    const campaign = await this.get(artistId, campaignId);
    if (campaign.approvalRequestId || campaign.status !== BookingCampaignStatus.draft) {
      throw new BadRequestException(
        "Recipients can only be changed while a campaign is an unprepared draft"
      );
    }
    const prospect = await this.prisma.client.bookingProspect.findFirst({
      where: { id: input.prospectId, artistId }
    });
    if (!prospect) throw new NotFoundException("Booking prospect not found");
    if (prospect.status !== "qualified") {
      throw new BadRequestException("Only qualified prospects can enter a campaign");
    }
    const contactId = input.contactId ?? prospect.contactId;
    const opportunityId = input.opportunityId ?? prospect.opportunityId;
    const contact = contactId ? await this.assertContact(artistId, contactId) : null;
    if (opportunityId) await this.assertOpportunity(artistId, opportunityId);
    const recipient = await this.prisma.client.bookingCampaignRecipient.create({
      data: {
        campaignId,
        prospectId: prospect.id,
        contactId: contactId ?? null,
        opportunityId: opportunityId ?? null,
        status: contact?.email
          ? BookingCampaignRecipientStatus.ready
          : BookingCampaignRecipientStatus.needs_contact,
        followUpDueAt: input.followUpDueAt ? new Date(input.followUpDueAt) : null
      },
      include: campaignInclude.recipients.include
    });
    await this.audit.log({
      artistId,
      aggregateType: "BookingCampaignRecipient",
      aggregateId: recipient.id,
      action: "booking_campaign.recipient_added",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { campaignId, prospectId: prospect.id, status: recipient.status }
    });
    return recipient;
  }

  async patchRecipient(
    artistId: string,
    campaignId: string,
    recipientId: string,
    input: BookingCampaignRecipientPatchInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    const campaign = await this.get(artistId, campaignId);
    const current = await this.prisma.client.bookingCampaignRecipient.findFirst({
      where: { id: recipientId, campaignId },
      include: { contact: true }
    });
    if (!current) throw new NotFoundException("Campaign recipient not found");
    if (
      campaign.approvalRequestId &&
      (input.contactId !== undefined || input.opportunityId !== undefined)
    ) {
      throw new BadRequestException(
        "Recipient links cannot change after an approval batch has been prepared"
      );
    }
    const contactId = input.contactId === undefined ? current.contactId : input.contactId;
    const opportunityId =
      input.opportunityId === undefined
        ? current.opportunityId
        : input.opportunityId;
    const contact = contactId ? await this.assertContact(artistId, contactId) : null;
    if (opportunityId) await this.assertOpportunity(artistId, opportunityId);
    const automaticStatus = contact?.email
      ? BookingCampaignRecipientStatus.ready
      : BookingCampaignRecipientStatus.needs_contact;
    const status = input.status ?? (
      input.contactId !== undefined ? automaticStatus : current.status
    );
    const recipient = await this.prisma.client.bookingCampaignRecipient.update({
      where: { id: recipientId },
      data: {
        ...(input.contactId !== undefined ? { contactId } : {}),
        ...(input.opportunityId !== undefined ? { opportunityId } : {}),
        ...(input.outcomeNote !== undefined ? { outcomeNote: input.outcomeNote } : {}),
        ...(input.outcomeKind !== undefined ? { outcomeKind: input.outcomeKind } : {}),
        ...(input.followUpDueAt !== undefined
          ? {
              followUpDueAt: input.followUpDueAt
                ? new Date(input.followUpDueAt)
                : null
            }
          : {}),
        status
      },
      include: campaignInclude.recipients.include
    });
    await this.audit.log({
      artistId,
      aggregateType: "BookingCampaignRecipient",
      aggregateId: recipient.id,
      action: "booking_campaign.recipient_updated",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { campaignId, updatedFields: Object.keys(input), status: recipient.status }
    });
    return recipient;
  }

  async prepareApproval(
    artistId: string,
    campaignId: string,
    input: BookingCampaignPrepareApprovalInput,
    actorLabel: string,
    actorOperatorId?: string | null
  ) {
    const profile = await this.profiles.assertReady(artistId);
    const campaign = await this.get(artistId, campaignId);
    if (campaign.approvalRequestId) {
      const previous = await this.prisma.client.approvalRequest.findFirst({
        where: { id: campaign.approvalRequestId, artistId }
      });
      if (
        previous &&
        !new Set<ApprovalStatus>([
          ApprovalStatus.rejected,
          ApprovalStatus.failed,
          ApprovalStatus.expired
        ]).has(previous.status)
      ) {
        return { approval: previous, previews: [], reused: true };
      }
      await this.prisma.client.$transaction([
        this.prisma.client.bookingCampaign.update({
          where: { id: campaignId },
          data: { approvalRequestId: null, status: BookingCampaignStatus.draft }
        }),
        this.prisma.client.bookingCampaignRecipient.updateMany({
          where: {
            campaignId,
            status: BookingCampaignRecipientStatus.approval_requested
          },
          data: { status: BookingCampaignRecipientStatus.ready }
        })
      ]);
    }
    const current = await this.get(artistId, campaignId);
    if (current.status !== BookingCampaignStatus.draft) {
      throw new BadRequestException("Only draft campaigns can prepare a new approval");
    }
    const wanted = input.recipientIds ? new Set(input.recipientIds) : null;
    const recipients = current.recipients.filter(
      (recipient) =>
        recipient.status === BookingCampaignRecipientStatus.ready &&
        (!wanted || wanted.has(recipient.id))
    );
    if (!recipients.length || (wanted && recipients.length !== wanted.size)) {
      throw new BadRequestException(
        "Choose one or more ready recipients with an email address"
      );
    }
    const artist = await this.prisma.client.artist.findUnique({
      where: { id: artistId },
      select: { name: true }
    });
    if (!artist) throw new NotFoundException("Artist not found");
    const now = new Date();
    const drafts = recipients.map((recipient) => {
      if (!recipient.contact?.email) {
        throw new BadRequestException("Campaign recipient needs a contact email");
      }
      const market = [
        recipient.prospect.city,
        recipient.prospect.region,
        recipient.prospect.country
      ]
        .filter((part): part is string => Boolean(part))
        .join(", ");
      const values = {
        artistName: artist.name,
        contactName: recipient.contact.fullName,
        prospectName: recipient.prospect.name,
        market,
        bookingPitch: profile.bookingPitch ?? "",
        pressKitUrl: profile.pressKitUrl ?? ""
      };
      return {
        recipientId: recipient.id,
        message: {
          to: recipient.contact.email,
          subject: renderBookingTemplate(campaign.subjectTemplate, values),
          body: renderBookingTemplate(campaign.bodyTemplate, values)
        },
        followUpDueAt:
          recipient.followUpDueAt ??
          new Date(now.getTime() + campaign.defaultFollowUpDays * 86400000)
      };
    });
    const approval = await this.approvals.create(artistId, {
      title: `${campaign.deliveryMode === BookingCampaignDeliveryMode.send_on_execution ? "Send" : "Draft"} ${drafts.length} pitch email(s) — ${campaign.name}`,
      actionType: campaign.deliveryMode === BookingCampaignDeliveryMode.send_on_execution ? "outbound_email_send_batch" : "outbound_email_batch",
      payload: {
        drafts: drafts.map((draft) => ({ message: draft.message })),
        campaign: {
          campaignId,
          deliveryMode: campaign.deliveryMode,
          recipients: drafts.map((draft) => ({
            recipientId: draft.recipientId,
            followUpDueAt: draft.followUpDueAt.toISOString()
          }))
        }
      },
      proposedBy: actorLabel,
      status: ApprovalStatus.pending,
      actorOperatorId: actorOperatorId ?? null
    });
    await this.prisma.client.$transaction([
      this.prisma.client.bookingCampaign.update({
        where: { id: campaignId },
        data: {
          approvalRequestId: approval.id,
          status: BookingCampaignStatus.active
        }
      }),
      this.prisma.client.bookingCampaignRecipient.updateMany({
        where: { id: { in: drafts.map((draft) => draft.recipientId) }, campaignId },
        data: { status: BookingCampaignRecipientStatus.approval_requested }
      }),
      ...[
            this.prisma.client.bookingCampaignDelivery.createMany({
              data: drafts.map((draft) => ({
                artistId,
                approvalId: approval.id,
                recipientId: draft.recipientId,
                status: "pending"
              }))
            })
          ]
    ]);
    await this.audit.log({
      artistId,
      aggregateType: "BookingCampaign",
      aggregateId: campaignId,
      action: "booking_campaign.approval_prepared",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { approvalId: approval.id, recipientCount: drafts.length }
    });
    return {
      approval,
      previews: drafts.map((draft) => ({
        recipientId: draft.recipientId,
        ...draft.message,
        followUpDueAt: draft.followUpDueAt
      })),
      reused: false
    };
  }
}
