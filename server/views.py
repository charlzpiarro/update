from email.utils import parsedate
from django.shortcuts import get_object_or_404
import django_filters
from rest_framework import viewsets, permissions, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from django.views.decorators.csrf import ensure_csrf_cookie
from django.http import JsonResponse
from django.db import transaction
from django.db.models import Sum, Count, F
from django.db.models.functions import TruncDay, TruncWeek, TruncMonth, TruncYear, ExtractMonth, Coalesce
from datetime import timedelta
from django.utils.timezone import now
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from django_filters.rest_framework import DjangoFilterBackend
from .pagination import OrderPagination, ProductPagination
from .rounding import round_two



from .models import (
    Category, Order, Product, StockEntry, Sale, SaleItem,
    Expense, Customer, Payment, Refund,ProductBatch 
)
from .serializers import (
    CategorySerializer, ConfirmOrderSerializer, LoanSerializer, OrderSerializer, ProductBatchSerializer, ProductSerializer, RejectOrderSerializer, SaleItemSerializer, StockEntrySerializer,
    SaleSerializer, ExpenseSerializer, CustomerSerializer,
    PaymentSerializer, RefundSerializer, UserCreateUpdateSerializer,
    MeSerializer, LoginSerializer,OrderUpdateSerializer
)
from .permissions import (
    All, IsAdminOnly, IsAdminOrReadOnly, IsCashierOnly,
    IsCashierOrAdmin, IsStaffOnly, IsStaffOrAdmin, 
)

User = get_user_model()


@ensure_csrf_cookie
def get_csrf_token(request):
    return JsonResponse({"detail": "CSRF cookie set"})


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        access = serializer.validated_data["access"]
        refresh = serializer.validated_data["refresh"]

        access_max_age = 6 * 60 * 60               # 5 minutes
        refresh_max_age = 365 * 24 * 60 * 60       # 7 days

        response = Response({
            "detail": "Login successful",
            "user": serializer.validated_data.get("user"),
        }, status=status.HTTP_200_OK)

        # Set cookies on path '/' so they're sent on all requests
        response.set_cookie(
            'access_token',
            access,
            httponly=True,
            secure=False,  # Set True in prod with HTTPS
            samesite='Lax',
            max_age=access_max_age,
            path='/'
        )
        response.set_cookie(
            'refresh_token',
            refresh,
            httponly=True,
            secure=False,
            samesite='Lax',
            max_age=refresh_max_age,
            path='/'
        )

        return response

class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        response = Response({"detail": "Logged out"}, status=status.HTTP_200_OK)

        # Clear cookies by setting empty value and max_age=0
        response.set_cookie(
            'access_token',
            '',
            httponly=True,
            secure=False,
            samesite='Lax',
            max_age=0,
            path='/'
        )
        response.set_cookie(
            'refresh_token',
            '',
            httponly=True,
            secure=False,
            samesite='Lax',
            max_age=0,
            path='/'
        )

        return response

class MeView(APIView):
    
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = MeSerializer(request.user)
        return Response(serializer.data)


# class UserViewSet(viewsets.ModelViewSet):
#     queryset = User.objects.all()
#     serializer_class = UserCreateUpdateSerializer
#     permission_classes = [IsAdminOnly]

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserCreateUpdateSerializer
    permission_classes = [IsAdminOnly]

    @action(detail=False, methods=['get'])
    def staff(self, request):
        # Example: filter users who have created orders (staff users)
        staff_users = User.objects.filter(order__isnull=False).distinct()

        serializer = self.get_serializer(staff_users, many=True)
        return Response(serializer.data)



class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAdminOrReadOnly]


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAdminOrReadOnly]
    # pagination_class = ProductPagination
    filter_backends = [
        django_filters.rest_framework.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ['category']
    search_fields = ['name']
    ordering_fields = ['created_at']

    def perform_create(self, serializer):
        # Save product and rely on nested batch serializer to handle batches
        serializer.save()

    @action(detail=True, methods=['post'], url_path='add-batch', permission_classes=[IsAdminOrReadOnly])
    @transaction.atomic
    def add_batch(self, request, pk=None):
        product = self.get_object()
        data = request.data

        try:
            batch_code = data.get('batch_code')
            expiry_date = data.get('expiry_date')
            quantity = int(data.get('quantity'))
            buying_price = data.get('buying_price')
            selling_price = data.get('selling_price')
            wholesale_price = data.get('wholesale_price', 0)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid data format."}, status=status.HTTP_400_BAD_REQUEST)

        if quantity <= 0:
            return Response({"detail": "Quantity must be positive."}, status=status.HTTP_400_BAD_REQUEST)

        # Ensure batch_code is unique for the product
        if ProductBatch.objects.filter(product=product, batch_code=batch_code).exists():
            return Response({"detail": f"Batch code '{batch_code}' already exists for this product."}, status=400)

        # ✅ Create new batch
        new_batch = ProductBatch.objects.create(
            product=product,
            batch_code=batch_code,
            expiry_date=expiry_date,
            buying_price=buying_price,
            selling_price=selling_price,
            wholesale_price=wholesale_price,
            recorded_by=request.user,
            quantity=0
        )

        # ✅ Update quantity
        new_batch.quantity += quantity
        new_batch.save()

        # ✅ Now log stock entry MANUALLY
        StockEntry.objects.create(
            product=product,
            batch=new_batch,  # 👈 ensures correct batch
            entry_type='added',
            quantity=quantity,
            recorded_by=request.user
        )

        return Response({
            "detail": "New batch added and stock logged.",
            "batch_id": new_batch.id,
            "batch_code": new_batch.batch_code,
            "new_quantity": new_batch.quantity,
            "expiry_date": new_batch.expiry_date,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='delete-batch', permission_classes=[IsAdminOrReadOnly])
    @transaction.atomic
    def delete_batch(self, request, pk=None):
        product = self.get_object()
        batch_id = request.data.get('batch_id')

        if not batch_id:
            return Response({"detail": "Batch ID required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            batch = product.batches.get(id=batch_id)
        except ProductBatch.DoesNotExist:
            return Response({"detail": "Batch not found for this product."}, status=status.HTTP_404_NOT_FOUND)

        # Optional: Log deletion
        if batch.quantity > 0:
            StockEntry.objects.create(
                product=product,
                batch=batch,
                entry_type='deleted',
                quantity=batch.quantity,
                recorded_by=request.user
            )

        batch.delete()

        return Response({"detail": "Batch deleted successfully."}, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['patch'], url_path='edit-batch', permission_classes=[IsAdminOrReadOnly])
    @transaction.atomic
    def edit_batch(self, request, pk=None):
        product = self.get_object()
        batch_id = request.data.get('batch_id')
        if not batch_id:
            return Response({"detail": "Batch ID required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            batch = product.batches.get(id=batch_id)
        except ProductBatch.DoesNotExist:
            return Response({"detail": "Batch not found for this product."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProductBatchSerializer(batch, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data, status=status.HTTP_200_OK)

    
    def perform_update(self, serializer):
        # We no longer track stock on the Product level directly
        serializer.save()

    def perform_destroy(self, instance):
        # Log deletion (note: quantity is now per batch)
        for batch in instance.batches.all():
            if batch.quantity > 0:
                StockEntry.objects.create(
                    product=instance,
                    batch=batch,
                    entry_type='deleted',
                    quantity=batch.quantity,
                    recorded_by=self.request.user
                )
        instance.delete()


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsStaffOrAdmin]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'phone', 'email']
    ordering_fields = ['created_at', 'name']


from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def customer_purchases(request, customer_id):
    customer = get_object_or_404(Customer, id=customer_id)
    # Fetch all sale items for this customer
    # Assuming SaleItem has a foreign key to Sale, and Sale has a foreign key to Customer
    sale_items = SaleItem.objects.filter(sale__customer=customer)

    serializer = SaleItemSerializer(sale_items, many=True)
    return Response(serializer.data)


class ProductBatchViewSet(viewsets.ModelViewSet):
    queryset = ProductBatch.objects.all()
    serializer_class = ProductBatchSerializer
    permission_classes = [IsAdminOnly]  # or your custom permission

    def partial_update(self, request, *args, **kwargs):
        # This handles PATCH /api/batches/{id}/
        return super().partial_update(request, *args, **kwargs)

class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [IsCashierOrAdmin]
    filter_backends = [filters.OrderingFilter, filters.SearchFilter]
    search_fields = ['sale__id', 'cashier__username']
    ordering_fields = ['payment_date', 'amount_paid']

    def perform_create(self, serializer):
        serializer.save(cashier=self.request.user)

    def perform_update(self, serializer):
        serializer.save()


class RefundViewSet(viewsets.ModelViewSet):
    queryset = Refund.objects.all()
    serializer_class = RefundSerializer
    permission_classes = [IsCashierOrAdmin]
    filter_backends = [filters.OrderingFilter, filters.SearchFilter]
    search_fields = ['sale__id', 'refunded_by__username']
    ordering_fields = ['refund_date', 'refund_amount']

    @transaction.atomic
    def perform_create(self, serializer):
        refund = serializer.save(refunded_by=self.request.user)
        product = refund.product

        if refund.batch:
            batch = refund.batch
            batch.quantity += refund.quantity
            batch.save()
        else:
            product.quantity_in_stock += refund.quantity
            product.save()

        StockEntry.objects.create(
            product=product,
            batch=refund.batch if refund.batch else None,
            entry_type='added',
            quantity=refund.quantity,
            recorded_by=self.request.user
        )
        sale = refund.sale
        sale.refund_total = (sale.refund_total or 0) + refund.refund_amount
        sale.save()

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        product = instance.product

        if instance.batch:
            batch = instance.batch
            batch.quantity -= instance.quantity
            batch.save()
        else:
            product.quantity_in_stock -= instance.quantity
            product.save()

        sale = instance.sale
        sale.refund_total = (sale.refund_total or 0) - instance.refund_amount
        sale.save()

        instance.delete()



class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['customer__name', 'notes']
    ordering_fields = ['created_at', 'status']
    pagination_class = OrderPagination

    def get_queryset(self):
        user = self.request.user
        status = self.request.query_params.get("status", None)

        base_qs = Order.objects.all()

        if status:
            base_qs = base_qs.filter(status=status)

        if user.role in ['cashier', 'admin']:
            return base_qs.order_by("-created_at",)

        return base_qs.filter(user=user).order_by("-created_at", "-id")

    def update(self, request, *args, **kwargs):
        user = request.user
        if user.role != 'admin':
            return Response({"error": "Only admin can update orders via this endpoint."}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        user = request.user
        if user.role != 'admin':
            return Response({"error": "Only admin can delete orders via this endpoint."}, status=403)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], permission_classes=[IsCashierOrAdmin])
    @transaction.atomic
    def confirm(self, request, pk=None):
        serializer = ConfirmOrderSerializer(
            data=request.data,
            context={'request': request, 'view': self}
        )
        serializer.is_valid(raise_exception=True)
        sale = serializer.save()
        return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch'], permission_classes=[IsStaffOrAdmin])
    def update_rejected(self, request, pk=None):
        order = self.get_object()

        serializer = OrderUpdateSerializer(order, data=request.data, partial=True)

        try:
            serializer.is_valid(raise_exception=True)
            serializer.save()
        except ValidationError as e:
            return Response({'errors': e.detail}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'errors': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[IsCashierOrAdmin])
    def reject(self, request, pk=None):
        user = request.user
        order = self.get_object()

        if order.status != "pending":
            return Response({"error": "Only pending orders can be rejected."}, status=400)

        # if user.is_staff:
        #     return Response({"error": "Staff cannot reject orders."}, status=403)

        serializer = RejectOrderSerializer(
            data=request.data,
            context={'request': request, 'view': self}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response({'message': 'Order rejected successfully'}, status=200)

    @action(detail=True, methods=["post"], permission_classes=[IsStaffOrAdmin])
    def resend(self, request, pk=None):
        user = request.user
        order = self.get_object()

        if order.status != "rejected":
            return Response({"error": "Only rejected orders can be resent."}, status=400)


        order.status = "updated"
        order.save()

        return Response({"message": "Order moved back to cashier."})

    @action(detail=True, methods=["delete"], permission_classes=[IsCashierOrAdmin])
    def delete_rejected(self, request, pk=None):
        user = request.user
        order = self.get_object()

        if order.status != "rejected":
            return Response({"error": "Only rejected orders can be deleted."}, status=400)

        if not user.is_staff:
            return Response({"error": "Only staff can delete rejected orders."}, status=403)

        order.delete()
        return Response({"message": "Rejected order permanently deleted."}, status=204)
    

class SaleViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Sale.objects.all()
    serializer_class = SaleSerializer
    permission_classes = [IsCashierOrAdmin]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['customer__name', 'payment_method']
    ordering_fields = ['date', 'total_amount', 'status']

    def get_queryset(self):
        user = self.request.user
        if user.role == 'cashier':
            return Sale.objects.filter(user=user)
        elif user.role == 'admin':
            return Sale.objects.all()
        return Sale.objects.none()

    @action(detail=True, methods=['post'], permission_classes=[IsCashierOrAdmin])
    @transaction.atomic
    def refund(self, request, pk=None):
        sale = self.get_object()

        refund_window_days = 50
        refund_deadline = sale.date + timedelta(days=refund_window_days)

        if now() > refund_deadline:
            return Response({"detail": "Refund window expired. Cannot refund this sale."}, status=status.HTTP_400_BAD_REQUEST)

        if sale.status == 'refunded':
            return Response({"detail": "Sale already refunded."}, status=status.HTTP_400_BAD_REQUEST)

        if sale.paid_amount <= 0:
            return Response({"detail": "This sale was not paid. Cannot process refund."}, status=status.HTTP_400_BAD_REQUEST)

        # 🔁 Create Refunds (stock logic handled in model)
        for item in sale.items.all():
            Refund.objects.create(
                sale=sale,
                product=item.product,
                batch=item.batch,
                quantity=item.quantity,
                refund_amount=0,  # not used anymore
                refunded_by=request.user,
            )

        # 💸 Set refund summary info on Sale
        sale.status = 'refunded'
        sale.payment_status = 'refunded'
        sale.refund_total = sale.paid_amount
        sale.save()

        # 💳 Create reverse payment record
        Payment.objects.create(
            sale=sale,
            amount_paid=-sale.paid_amount,
            cashier=request.user,
            payment_method="refund"
        )

        return Response({"detail": f"Sale refunded. Refunded amount: {sale.paid_amount} TZS"}, status=status.HTTP_200_OK)




class LoanViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Sale.objects.filter(is_loan=True).exclude(status='refunded').exclude(payment_status='paid')
    serializer_class = LoanSerializer
    permission_classes = [IsCashierOrAdmin]

    @action(detail=True, methods=['post'], url_path='pay')
    def pay_loan(self, request, pk=None):
        sale = self.get_object()
        raw_amount = request.data.get("amount")

        if raw_amount is None:
            return Response({"error": "Amount is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            amount = Decimal(str(raw_amount).strip())
        except (InvalidOperation, ValueError, TypeError):
            return Response({"error": "Invalid amount format"}, status=status.HTTP_400_BAD_REQUEST)

        if amount <= 0:
            return Response({"error": "Amount must be greater than 0"}, status=status.HTTP_400_BAD_REQUEST)

        remaining = sale.final_amount - sale.paid_amount
        if amount > remaining:
            return Response({"error": "Payment exceeds remaining balance"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            sale.paid_amount += amount
            sale.payment_status = "paid" if sale.paid_amount >= sale.final_amount else "partial"
            sale.save()

        return Response({"message": "Payment recorded successfully"}, status=status.HTTP_200_OK)


#Update ExpenseViewSet` to filter expenses by date range
from django.utils.dateparse import parse_date
class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsCashierOrAdmin]

    def get_queryset(self):
        queryset = Expense.objects.all()
        request = self.request

        # Parse start_date and end_date from query params
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        # Default to today if no date range provided
        today = now().date()
        start_date = parse_date(start_date_str) if start_date_str else today
        end_date = parse_date(end_date_str) if end_date_str else today

        # Normalize to datetime range
        start_datetime = make_aware(datetime.combine(start_date, datetime.min.time()))
        end_datetime = make_aware(datetime.combine(end_date, datetime.max.time()))

        return queryset.filter(date__range=(start_datetime, end_datetime)).order_by('-date')




class StockEntryFilter(django_filters.FilterSet):
    start_date = django_filters.DateFilter(field_name="date", lookup_expr='gte')
    end_date = django_filters.DateFilter(field_name="date", lookup_expr='lte')
    product = django_filters.NumberFilter(field_name="product__id")

    class Meta:
        model = StockEntry
        fields = ['start_date', 'end_date', 'product']


class StockEntryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockEntry.objects.all() \
        .select_related('product', 'recorded_by', 'batch') \
        .order_by('-date')

    serializer_class = StockEntrySerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.OrderingFilter,
        filters.SearchFilter
    ]
    filterset_class = StockEntryFilter
    search_fields = ['product__name', 'recorded_by__username', 'batch__batch_code']
    ordering_fields = ['date', 'quantity']
# REPORTS AND DASHBOARD



from django.db.models import Q, Sum, Count, F, ExpressionWrapper, DecimalField

from django.db.models.functions import TruncDay, TruncWeek, TruncMonth, TruncYear
from django.db.models import Sum, F, ExpressionWrapper, DecimalField, Q, Count
from django.utils.timezone import now
from datetime import timedelta
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import permissions


class ReportSummaryAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        period = request.query_params.get('period', 'daily').lower()
        today = now().date()

        if period == 'daily':
            start_date = today
            trunc_func = TruncDay
        elif period == 'weekly':
            start_date = today - timedelta(days=today.weekday())
            trunc_func = TruncWeek
        elif period == 'monthly':
            start_date = today.replace(day=1)
            trunc_func = TruncMonth
        elif period == 'yearly':
            start_date = today.replace(month=1, day=1)
            trunc_func = TruncYear
        else:
            return Response({"error": "Invalid period. Choose from daily, weekly, monthly, yearly."}, status=400)

        # Base queries
        base_sales_qs = Sale.objects.filter(date__date__gte=start_date)
        sales_qs = base_sales_qs.exclude(status='refunded')
        expenses_qs = Expense.objects.filter(date__gte=start_date)
        refunded_sales_qs = base_sales_qs.filter(status='refunded')
        loan_sales = sales_qs.filter(is_loan=True)

        remaining_expr = ExpressionWrapper(
            F('total_amount') - F('paid_amount'),
            output_field=DecimalField(max_digits=12, decimal_places=2)
        )

        # Totals
        total_sales = sales_qs.aggregate(total=Sum('paid_amount'))['total'] or 0
        wholesaler_sales = sales_qs.filter(sale_type='wholesale').aggregate(total=Sum('paid_amount'))['total'] or 0
        retailer_sales = sales_qs.filter(sale_type='retail').aggregate(total=Sum('paid_amount'))['total'] or 0
        total_expenses = expenses_qs.aggregate(total=Sum('amount'))['total'] or 0
        orders_count = sales_qs.aggregate(count=Count('id'))['count'] or 0

        # Stock value
        stock_buying = ProductBatch.objects.aggregate(
            total=Sum(F('quantity') * F('buying_price'))
        )['total'] or 0

        stock_selling = ProductBatch.objects.aggregate(
            total=Sum(F('quantity') * F('selling_price'))
        )['total'] or 0

        # Loan breakdown
        loan_paid = loan_sales.filter(paid_amount__gt=0)
        loan_paid_amount = loan_paid.aggregate(total=Sum('paid_amount'))['total'] or 0
        loan_paid_count = loan_paid.count()

        loan_unpaid = loan_sales.annotate(remaining=remaining_expr).filter(remaining__gt=0)
        loan_unpaid_amount = loan_unpaid.aggregate(total=Sum('remaining'))['total'] or 0
        loan_unpaid_count = loan_unpaid.count()

        # Refunds
        refund_amount = refunded_sales_qs.aggregate(total=Sum('total_amount'))['total'] or 0
        refund_count = refunded_sales_qs.count()

        # Profit calculation (confirmed + paid sales only)
        profit_expr = ExpressionWrapper(
            F('quantity') * (F('price_per_unit') - F('batch__buying_price')),
            output_field=DecimalField(max_digits=12, decimal_places=2)
        )

        wholesale_profit = SaleItem.objects.filter(
            sale__date__date__gte=start_date,
            sale__status='confirmed',
            sale__payment_status='paid',
            sale__sale_type='wholesale'
        ).annotate(profit=profit_expr).aggregate(total=Sum('profit'))['total'] or 0

        retail_profit = SaleItem.objects.filter(
            sale__date__date__gte=start_date,
            sale__status='confirmed',
            sale__payment_status='paid',
            sale__sale_type='retail'
        ).annotate(profit=profit_expr).aggregate(total=Sum('profit'))['total'] or 0

        net_profit = SaleItem.objects.filter(
            sale__date__date__gte=start_date,
            sale__status='confirmed',
            sale__payment_status='paid'
        ).annotate(profit=profit_expr).aggregate(total=Sum('profit'))['total'] or 0

        # Time series
        def group_series(queryset, value_field, label='total'):
            return queryset.annotate(period=trunc_func('date')).values('period').annotate(
                total=Sum(value_field)
            ).order_by('period')

        sales_time_series = group_series(sales_qs, 'paid_amount')
        expenses_time_series = group_series(expenses_qs, 'amount')
        loan_paid_time_series = group_series(loan_paid, 'paid_amount')
        loan_unpaid_time_series = loan_unpaid.annotate(
            period=trunc_func('date')
        ).values('period').annotate(
            remaining=Sum(remaining_expr)
        ).order_by('period')
        refund_time_series = group_series(refunded_sales_qs, 'total_amount')

        def fill_series(series_qs):
            result = {}
            for item in series_qs:
                date_key = item['period'].date().isoformat() if hasattr(item['period'], 'date') else str(item['period'])
                result[date_key] = float(item.get('total') or item.get('remaining') or 0)
            return result

        sales_data = fill_series(sales_time_series)
        expenses_data = fill_series(expenses_time_series)
        loan_paid_data = fill_series(loan_paid_time_series)
        loan_unpaid_data = fill_series(loan_unpaid_time_series)
        refund_data = fill_series(refund_time_series)

        all_dates = sorted(set(
            list(sales_data.keys()) +
            list(expenses_data.keys()) +
            list(loan_paid_data.keys()) +
            list(loan_unpaid_data.keys()) +
            list(refund_data.keys())
        ))

        def complete_data(data_dict):
            return [data_dict.get(date, 0) for date in all_dates]

        return Response({
            "period": period,
            "sales": total_sales,
            "wholesalerSales": wholesaler_sales,
            "retailerSales": retailer_sales,
            "expenses": total_expenses,
            "stockBuying": stock_buying,
            "stockSelling": stock_selling,
            "orders": orders_count,
            "profit": total_sales - total_expenses,  # gross diff, not accurate profit
            "wholesalerProfit": wholesale_profit,
            "retailerProfit": retail_profit,
            "netProfit": net_profit,
            "loss": max(0, total_expenses - total_sales),
            "loansPaid": loan_paid_amount,
            "loansPaidCount": loan_paid_count,
            "loansUnpaid": loan_unpaid_amount,
            "loansUnpaidCount": loan_unpaid_count,
            "refundAmount": refund_amount,
            "refundCount": refund_count,
            "chart": {
                "dates": all_dates,
                "sales": complete_data(sales_data),
                "expenses": complete_data(expenses_data),
                "loanPaid": complete_data(loan_paid_data),
                "loanUnpaid": complete_data(loan_unpaid_data),
                "refunds": complete_data(refund_data),
            }
        })




class RefundViewSet(viewsets.ModelViewSet):
    queryset = Refund.objects.all()
    serializer_class = RefundSerializer
    permission_classes = [IsCashierOrAdmin]
    filter_backends = [filters.OrderingFilter, filters.SearchFilter]
    search_fields = ['sale__id', 'refunded_by__username']
    ordering_fields = ['refund_date', 'refund_amount']

    @transaction.atomic
    def perform_create(self, serializer):
        # Just save, model will handle stock and refund_total updates
        serializer.save(refunded_by=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        # Keep it simple, no special handling for update now
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        # If you want, handle rollback of stock and refund_total here
        product = instance.product
        product.quantity_in_stock -= instance.quantity
        product.save()

        sale = instance.sale
        sale.refund_total = (sale.refund_total or 0) - instance.refund_amount
        sale.save()

        instance.delete()





class DashboardMetricsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        valid_sales = Sale.objects.exclude(status='refunded')  # 👈 Only real ones

        total_sales = valid_sales.count()
        total_revenue = valid_sales.aggregate(total=Sum('paid_amount'))['total'] or 0

        return Response({
            'total_sales': total_sales,
            'total_revenue': float(total_revenue),
        })



class MonthlySalesAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        current_year = now().year

        monthly_sales = (
            Sale.objects
            .filter(date__year=current_year)
            .exclude(status='refunded')  # 👈 kill the refunds
            .annotate(month=ExtractMonth('date'))
            .values('month')
            .annotate(total_amount=Sum('paid_amount'))
            .order_by('month')
        )

        sales_data = [0] * 12
        for entry in monthly_sales:
            sales_data[entry['month'] - 1] = float(entry['total_amount'] or 0)

        return Response({"sales": sales_data})



class SalesSummaryAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = now().date()
        current_year = today.year
        current_month = today.month

        # --- Current Month Revenue and Sale Count ---
        current_month_sales = Sale.objects.filter(
            date__year=current_year,
            date__month=current_month
        ).exclude(status='refunded')

        current_month_revenue = current_month_sales.aggregate(
            total=Sum('paid_amount')
        )['total'] or 0

        monthly_sales_count = current_month_sales.count()

        # --- Previous Month Revenue ---
        if current_month == 1:
            prev_year = current_year - 1
            prev_month = 12
        else:
            prev_year = current_year
            prev_month = current_month - 1

        prev_month_revenue = (
            Sale.objects.filter(
                date__year=prev_year,
                date__month=prev_month
            ).exclude(status='refunded')
            .aggregate(total=Sum('paid_amount'))['total'] or 0
        )

        # --- Today's Revenue ---
        todays_revenue = (
            Sale.objects.filter(date__date=today)
            .exclude(status='refunded')
            .aggregate(total=Sum('paid_amount'))['total'] or 0
        )

        # --- Progress Percentage ---
        if prev_month_revenue == 0:
            progress_percent = 100.0 if current_month_revenue > 0 else 0.0
        else:
            progress_percent = ((current_month_revenue - prev_month_revenue) / prev_month_revenue) * 100

        # --- Final Response ---
        return Response({
            "monthly_revenue": float(current_month_revenue),
            "monthly_sales_count": monthly_sales_count,
            "todays_revenue": float(todays_revenue),
            "prev_month_revenue": float(prev_month_revenue),
            "progress_percent": round(progress_percent, 2),
        })



class RecentLoginsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        recent_users = User.objects.filter(last_login__isnull=False).order_by('-last_login')[:5]
        data = [
            {"username": u.username, "last_login": u.last_login, "role": u.role}
            for u in recent_users
        ]
        return Response(data)


class RecentSalesAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        recent_sales = Sale.objects.exclude(status='refunded').order_by('-date')[:5]
        serializer = SaleSerializer(recent_sales, many=True)
        return Response(serializer.data)



# StockReportAPIView
class StockReportAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        period = request.query_params.get('period', 'daily').lower()
        today = now().date()
        soon_expiry_days = 180
        soon_expiry_date = today + timedelta(days=soon_expiry_days)

        # Period trunc function & start_date for time series
        if period == 'daily':
            trunc_func = TruncDay
            start_date = today - timedelta(days=30)
        elif period == 'weekly':
            trunc_func = TruncWeek
            start_date = today - timedelta(weeks=12)
        elif period == 'monthly':
            trunc_func = TruncMonth
            start_date = (today.replace(day=1) - timedelta(days=365))  # 1 year back
        elif period == 'yearly':
            trunc_func = TruncYear
            start_date = (today.replace(month=1, day=1) - timedelta(days=365*5))  # 5 years back
        else:
            return Response({"error": "Invalid period. Choose from daily, weekly, monthly, yearly."}, status=400)

        # Total stock quantity
        total_stock_qty = ProductBatch.objects.aggregate(
            total_qty=Coalesce(Sum('quantity'), 0)
        )['total_qty']

        # --- EXPIRED and SOON EXPIRING batches (full details) ---
        expired_batches = ProductBatch.objects.filter(
            expiry_date__lt=today,
            quantity__gt=0
        ).select_related('product').values(
            'id', 'batch_code', 'expiry_date', 'quantity', 'buying_price', 'product__id', 'product__name'
        )

        soon_expiring_batches = ProductBatch.objects.filter(
            expiry_date__gte=today,
            expiry_date__lt=soon_expiry_date,
            quantity__gt=0
        ).select_related('product').values(
            'id', 'batch_code', 'expiry_date', 'quantity', 'product__id', 'product__name'
        )

        # Calculate total loss from expired stock
        total_expired_loss = 0
        for batch in expired_batches:
            total_expired_loss += float(batch['buying_price']) * batch['quantity']

        # --- LOW STOCK PRODUCTS (full details) ---
        low_stock_products = Product.objects.annotate(
            total_stock=Coalesce(Sum('batches__quantity'), 0)
        ).filter(total_stock__lte=F('threshold')).values(
            'id', 'name', 'threshold', 'total_stock'
        )

        # --- MOST SOLD ITEMS ---
        most_sold_qs = SaleItem.objects.filter(
            sale__status='confirmed',
            sale__date__date__gte=start_date
        ).values('product__id', 'product__name').annotate(
            total_sold=Coalesce(Sum('quantity'), 0)
        ).order_by('-total_sold')[:10]

        # --- STOCK MOVEMENT TIME SERIES ---
        restock_qs = StockEntry.objects.filter(
            date__date__gte=start_date,
            entry_type__in=['added', 'returned']
        ).annotate(period=trunc_func('date')).values('period').annotate(
            total=Coalesce(Sum('quantity'), 0)
        ).order_by('period')

        sales_qs = SaleItem.objects.filter(
            sale__status='confirmed',
            sale__date__date__gte=start_date
        ).annotate(period=trunc_func('sale__date')).values('period').annotate(
            total=Coalesce(Sum('quantity'), 0)
        ).order_by('period')

        def qs_to_dict(qs):
            d = {}
            for e in qs:
                dt = e['period']
                key = dt.date().isoformat() if hasattr(dt, 'date') else str(dt)
                d[key] = e['total']
            return d

        restocks_data = qs_to_dict(restock_qs)
        sales_data = qs_to_dict(sales_qs)

        all_dates = sorted(set(list(restocks_data.keys()) + list(sales_data.keys())))

        response = {
            "period": period,
            "totalStockQty": total_stock_qty,
            "expiredBatches": list(expired_batches),
            "soonExpiringBatches": list(soon_expiring_batches),
            "lowStockProducts": list(low_stock_products),
            "mostSoldItems": list(most_sold_qs),
            "stockMovement": [
                {
                    "date": date,
                    "Restocked": restocks_data.get(date, 0),
                    "Sold": sales_data.get(date, 0),
                } for date in all_dates
            ],
            "totalExpiredLoss": round(total_expired_loss, 2),
        }

        return Response(response)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def edit_batch(request, product_id, batch_id):
    try:
        batch = ProductBatch.objects.get(id=batch_id, product_id=product_id)
    except ProductBatch.DoesNotExist:
        return Response({'error': 'Batch not found.'}, status=status.HTTP_404_NOT_FOUND)

    data = request.data

    # Update fields if they exist in the request
    batch.expiry_date = data.get('expiry_date', batch.expiry_date)
    batch.quantity = data.get('quantity', batch.quantity)
    batch.buying_price = data.get('buying_price', batch.buying_price)
    batch.selling_price = data.get('selling_price', batch.selling_price)
    batch.wholesale_price = data.get('wholesale_price', batch.wholesale_price)

    batch.save()

    return Response({'message': 'Batch updated successfully.'})







## Profit Report View
from main.models import SaleItem
class ProfitReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        period = request.query_params.get('period', 'daily').lower()
        now = timezone.now()

        if period == 'daily':
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == 'weekly':
            start_date = now - timedelta(days=7)
        elif period == 'monthly':
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif period == 'yearly':
            start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Load only confirmed sales
        sale_items = SaleItem.objects.select_related('sale', 'batch', 'product').filter(
            sale__status='confirmed',
            sale__date__gte=start_date
        )

        # Precompute sale total per sale_id
        sale_totals = {}
        for item in sale_items:
            sale_id = item.sale_id
            if sale_id not in sale_totals:
                sale_totals[sale_id] = Decimal('0.00')
            sale_totals[sale_id] += Decimal(item.quantity) * item.batch.selling_price

        total_selling = Decimal('0.00')
        total_buying = Decimal('0.00')
        total_profit = Decimal('0.00')
        product_summary = {}

        for item in sale_items:
            sale = item.sale
            batch = item.batch
            product_name = item.product.name
            sale_total = sale_totals[item.sale_id] or Decimal('0.00')

            item_selling_price = Decimal(item.quantity) * batch.selling_price
            proportion = item_selling_price / sale_total if sale_total > 0 else Decimal('0.00')
            discounted_selling = proportion * sale.paid_amount  # use paid_amount

            buying = Decimal(item.quantity) * batch.buying_price
            profit = discounted_selling - buying

            total_selling += discounted_selling
            total_buying += buying
            total_profit += profit

            if product_name not in product_summary:
                product_summary[product_name] = {
                    'selling_total': Decimal('0.00'),
                    'buying_total': Decimal('0.00'),
                    'profit': Decimal('0.00'),
                }

            product_summary[product_name]['selling_total'] += discounted_selling
            product_summary[product_name]['buying_total'] += buying
            product_summary[product_name]['profit'] += profit

        products_list = [
            {
                'name': name,
                'selling_total': values['selling_total'],
                'buying_total': values['buying_total'],
                'profit': values['profit'],
            }
            for name, values in product_summary.items()
        ]

        return Response({
            'stockSelling': total_selling,
            'stockBuying': total_buying,
            'profit': total_profit,
            'products': products_list,
        })



# Wholesale Report View
import pytz
EAT = pytz.timezone("Africa/Nairobi")
class WholesaleReportAPIView(APIView):
    def get(self, request):
        now_utc = timezone.now()
        now_eat = now_utc.astimezone(EAT)

        period = request.GET.get("period", "daily")
        start = request.GET.get("start")
        end = request.GET.get("end")
        user_id = request.GET.get("user_id")

        orders = Order.objects.filter(order_type='wholesale', status='confirmed')
        if user_id:
            orders = orders.filter(user_id=user_id)

        def serialize(qs):
            result = []
            for o in qs:
                created_at_eat = o.created_at.astimezone(EAT)
                total = float(o.sale.paid_amount) if hasattr(o, 'sale') else 0
                profit = total * 0.15  # You can replace with actual logic

                result.append({
                    "id": o.id,
                    "user": o.user.username if o.user else "Unknown",
                    "customer": o.customer.name if o.customer else "",
                    "date": created_at_eat.strftime("%Y-%m-%d %H:%M"),
                    "discount": float(o.discount_percent),
                    "total": total,
                    "profit": profit,
                })
            return result

        if period == "custom":
            start_date = parsedate(start)
            end_date = parsedate(end)
            if start_date and end_date:
                qs = orders.filter(created_at__date__gte=start_date, created_at__date__lte=end_date)
                return Response({"custom": serialize(qs)})
            else:
                return Response({"custom": []})

        filters = {
            "daily": orders.filter(created_at__date=now_eat.date()),
            "weekly": orders.filter(created_at__gte=now_utc - timedelta(days=7)),
            "monthly": orders.filter(created_at__month=now_eat.month, created_at__year=now_eat.year),
            "yearly": orders.filter(created_at__year=now_eat.year),
        }

        return Response({key: serialize(qs) for key, qs in filters.items()})




#SHORT REPORT VIEW
from django.utils.timezone import now
from django.utils.timezone import make_aware
from datetime import timedelta, datetime
from django.db.models.functions import TruncDate
from django.db.models import Sum, Count, Case, When, Value
from .models import Order  # or your actual import path
from .models import Sale    # make sure you import Sale directly
class ShortReportView(APIView):
    def get(self, request):
        start = request.GET.get('start')
        end = request.GET.get('end')

        if not start or not end:
            return Response({"error": "Start and end dates are required."}, status=400)

        start_date = parse_date(start)
        end_date = parse_date(end)

        sales = Sale.objects.filter(
            date__date__range=(start_date, end_date),
        ).exclude(status='refunded')

        grouped = {}

        for sale in sales:
            day = sale.date.date().isoformat()
            if day not in grouped:
                grouped[day] = {
                    "date": day,
                    "total_sales": 0,
                    "retail_sales": 0,
                    "wholesale_sales": 0,
                    "sales_count": 0,
                }

            grouped[day]["total_sales"] += float(sale.paid_amount)
            grouped[day]["sales_count"] += 1

            if sale.sale_type == "retail":
                grouped[day]["retail_sales"] += float(sale.paid_amount)
            elif sale.sale_type == "wholesale":
                grouped[day]["wholesale_sales"] += float(sale.paid_amount)

        sorted_report = sorted(grouped.values(), key=lambda x: x["date"])

        return Response({
            "start_date": start,
            "end_date": end,
            "report": sorted_report
        })